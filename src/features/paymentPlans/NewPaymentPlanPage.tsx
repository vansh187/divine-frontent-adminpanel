import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BackLink } from "../../components/ui/BackLink";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { Select } from "../../components/ui/Select";
import { TextArea } from "../../components/ui/TextArea";
import { TextField } from "../../components/ui/TextField";
import {
  ApiError,
  createPaymentPlan,
  listAdminPaymentPlans,
  validatePaymentPlan,
  type ApiPaymentPlan,
  type PaymentPlanCreatePayload,
  type PlanChargeHead,
  type PlanDueTrigger,
} from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { PlanDetails } from "./PlanDetails";
import { CHARGE_HEAD_LABEL } from "./planLabels";

// Mirrors the backend's rules (service_payment_plans.normalize_definition).
const CODE_RE = /^[A-Za-z0-9][A-Za-z0-9/_.-]{1,79}$/;
const SHORT_CODE_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,19}$/;
const PROJECT_RE = /^[a-z0-9][a-z0-9-]{0,99}$/;
const PERCENT_RE = /^\d+(\.\d{1,3})?$/;
const MAX_INSTALMENTS = 24;
const MAX_DUE_DAYS = 3650;
// Text limits, same as the backend DTOs. Inputs use them as maxLength and show a counter.
const CODE_MAX = 80;
const SHORT_CODE_MAX = 20;
const NAME_MIN = 2;
const NAME_MAX = 150;
const PROJECT_MAX = 100;
const DESCRIPTION_MAX = 1000;
const LABEL_MAX = 150;
// Reserved by the backend: GET /payment-plans/preview would clash with the plan's URL.
const RESERVED_CODE = "preview";

const API_ERROR_MESSAGES: Record<string, string> = {
  payment_plan_exists: "A payment plan with this code already exists. Use a different plan code.",
  short_code_in_use: "Another active plan already uses this short code.",
  invalid_plan_code: "Plan code is invalid. Use letters, numbers and / _ . - only.",
  invalid_short_code: "Short code is invalid. Use letters, numbers and - only (max 20).",
  invalid_plan_name: "Plan name must be 2 to 150 characters.",
  invalid_description: "Description is too long (max 1000 characters).",
  invalid_project_id: "Project ID is invalid. Use lowercase letters, numbers and - only.",
  invalid_sort_order: "Display order must be a whole number from 0 to 1000.",
  invalid_instalments: "One of the instalments is invalid. Check the labels, percentages and days.",
  invalid_payment_plan:
    "The plan is invalid: percentages must add up to 100, the first instalment must be due on booking, and each charge can be added to only one instalment.",
  sale_price_too_small: "The instalment split produces amounts that are too small. Check the percentages.",
};

interface InstalmentDraft {
  key: number;
  label: string;
  percent: string;
  dueTrigger: PlanDueTrigger;
  dueDays: string;
  chargeHead: "" | PlanChargeHead;
}

let nextKey = 1;
function blankInstalment(overrides: Partial<InstalmentDraft> = {}): InstalmentDraft {
  return { key: nextKey++, label: "", percent: "", dueTrigger: "booking", dueDays: "", chargeHead: "", ...overrides };
}

/** Percent as thousandths, so 33.333 + 33.333 + 33.334 sums exactly. */
function toThousandths(value: string) {
  return PERCENT_RE.test(value.trim()) ? Math.round(Number(value.trim()) * 1000) : null;
}

/** Same wording as the backend's due_text, so the admin sees what customers will see. */
function dueSummary(row: InstalmentDraft, isFirst: boolean) {
  if (isFirst) return "On booking";
  const raw = row.dueDays.trim();
  const days = /^\d+$/.test(raw) ? Number(raw) : 0;
  if (row.dueTrigger === "possession") {
    return days ? `${days} days after Offer of Possession` : "On Offer of Possession";
  }
  return days ? `${days} days after booking` : "On booking";
}

/**
 * The first row is the booking payment, always due on booking. When a row moves into
 * first place (reorder / remove) its own due settings are reset; returns whether any
 * non-default setting was dropped so the admin can be told.
 */
function lockFirstRow(rows: InstalmentDraft[]): { rows: InstalmentDraft[]; resetLabel: string | null } {
  const first = rows[0];
  if (!first) return { rows, resetLabel: null };
  const hadCustomDue = first.dueTrigger !== "booking" || (first.dueDays.trim() !== "" && Number(first.dueDays) !== 0);
  if (!hadCustomDue && first.dueDays === "") return { rows, resetLabel: null };
  return {
    rows: [{ ...first, dueTrigger: "booking", dueDays: "" }, ...rows.slice(1)],
    resetLabel: hadCustomDue ? first.label.trim() || "The instalment now first" : null,
  };
}

function formatThousandths(value: number) {
  return `${Number((value / 1000).toFixed(3))}%`;
}

export function NewPaymentPlanPage() {
  const { accessToken } = useAuth();
  const navigate = useNavigate();

  const [code, setCode] = useState("");
  const [shortCode, setShortCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [instalments, setInstalments] = useState<InstalmentDraft[]>(() => [
    blankInstalment({ label: "Booking Amount" }),
    blankInstalment(),
  ]);

  const [existingPlans, setExistingPlans] = useState<ApiPaymentPlan[]>([]);
  const [showErrors, setShowErrors] = useState(false);
  const [submitting, setSubmitting] = useState<"preview" | "create" | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ApiPaymentPlan | null>(null);
  const [rowNotice, setRowNotice] = useState<string | null>(null);

  // Bumped on every edit. An async preview/error is only applied if the form is
  // unchanged since the request went out, so a late response can't show stale data.
  const formVersion = useRef(0);
  // The display order is suggested at most once, and never after the admin edits it.
  const sortOrderSettled = useRef(false);

  // Existing plans feed the project suggestions, duplicate checks and the suggested
  // display order. Project is never pre-filled: blank means "all projects".
  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    listAdminPaymentPlans(accessToken)
      .then((res) => {
        if (cancelled || !Array.isArray(res.plans)) return;
        setExistingPlans(res.plans);
        const maxOrder = Math.max(-1, ...res.plans.map((p) => p.sort_order ?? 0));
        if (maxOrder >= 0 && !sortOrderSettled.current) {
          sortOrderSettled.current = true;
          // The payload changes, so any preview taken before this is stale.
          formVersion.current += 1;
          setPreview(null);
          setSortOrder(String(Math.min(1000, maxOrder + 1)));
        }
      })
      .catch(() => {
        // Suggestions only — the form still works without them.
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const projectSuggestions = useMemo(
    () => [...new Set(existingPlans.map((p) => p.project_id).filter((p): p is string => !!p))],
    [existingPlans]
  );

  const totalThousandths = instalments.reduce((sum, row) => sum + (toThousandths(row.percent) ?? 0), 0);

  // ---- validation -----------------------------------------------------------
  const fieldErrors = useMemo(() => {
    const errors: Record<string, string> = {};
    // Lengths are checked on the trimmed value (what is sent); maxLength on the
    // inputs caps the raw value, so these only fire for too-short input.
    const trimmedCode = code.trim();
    if (!trimmedCode) errors.code = "Plan code is required.";
    else if (trimmedCode.toLowerCase() === RESERVED_CODE)
      errors.code = `"${trimmedCode}" is a reserved word and can't be used as a plan code.`;
    else if (trimmedCode.length < 2 || trimmedCode.length > CODE_MAX)
      errors.code = `Plan code must be 2 to ${CODE_MAX} characters.`;
    else if (!CODE_RE.test(trimmedCode))
      errors.code = "Use letters, numbers and / _ . - only, starting with a letter or number.";
    // Case-insensitive, so near-identical permanent codes (PP5/... vs pp5/...) can't coexist.
    else if (existingPlans.some((p) => p.code.toLowerCase() === trimmedCode.toLowerCase()))
      errors.code = "A plan with this code already exists.";

    const trimmedShort = shortCode.trim();
    if (!trimmedShort) errors.shortCode = "Short code is required.";
    else if (trimmedShort.length > SHORT_CODE_MAX) errors.shortCode = `Max ${SHORT_CODE_MAX} characters.`;
    else if (!SHORT_CODE_RE.test(trimmedShort))
      errors.shortCode = "Use letters, numbers and - only, starting with a letter or number.";
    else if (
      existingPlans.some((p) => p.is_active && (p.short_code ?? "").toLowerCase() === trimmedShort.toLowerCase())
    )
      errors.shortCode = "An active plan already uses this short code.";

    const trimmedName = name.trim();
    if (trimmedName.length < NAME_MIN || trimmedName.length > NAME_MAX)
      errors.name = `Plan name must be ${NAME_MIN} to ${NAME_MAX} characters.`;

    const trimmedProject = projectId.trim();
    if (trimmedProject.length > PROJECT_MAX) errors.projectId = `Max ${PROJECT_MAX} characters.`;
    else if (trimmedProject && !PROJECT_RE.test(trimmedProject))
      errors.projectId = "Lowercase letters, numbers and - only (e.g. suraksha-enclave).";

    if (!/^\d+$/.test(sortOrder.trim()) || Number(sortOrder) > 1000)
      errors.sortOrder = "A whole number from 0 to 1000.";

    instalments.forEach((row, i) => {
      const label = row.label.trim();
      if (!label) errors[`label-${row.key}`] = "Label is required.";
      else if (label.length > LABEL_MAX) errors[`label-${row.key}`] = `Max ${LABEL_MAX} characters.`;
      const pct = toThousandths(row.percent);
      if (pct === null || pct <= 0 || pct > 100000)
        errors[`percent-${row.key}`] = "Between 0 and 100, up to 3 decimals.";
      if (i > 0 && row.dueDays.trim() && (!/^\d+$/.test(row.dueDays.trim()) || Number(row.dueDays) > MAX_DUE_DAYS))
        errors[`days-${row.key}`] = `Whole days, 0 to ${MAX_DUE_DAYS}.`;
    });

    const heads = instalments.map((r) => r.chargeHead).filter(Boolean);
    if (new Set(heads).size !== heads.length || (heads.includes("ALL") && heads.length > 1))
      errors.chargeHeads =
        "Each charge (PLC, IFMS, CAM) can be added to only one instalment, and \"All charges\" can't be combined with others.";

    if (instalments.length === 0) errors.instalments = "Add at least one instalment.";
    else if (totalThousandths !== 100000)
      errors.instalments = `Instalment percentages must add up to 100% (currently ${formatThousandths(totalThousandths)}).`;

    return errors;
  }, [code, shortCode, name, projectId, sortOrder, instalments, existingPlans, totalThousandths]);

  const isValid = Object.keys(fieldErrors).length === 0;
  const err = (key: string) => (showErrors ? fieldErrors[key] ?? null : null);

  // ---- form helpers -------------------------------------------------------------
  // Any edit invalidates a previous preview so it can never show stale numbers.
  function touched() {
    formVersion.current += 1;
    setPreview(null);
    setApiError(null);
    setRowNotice(null);
  }

  function updateRow(key: number, patch: Partial<InstalmentDraft>) {
    touched();
    setInstalments((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function addRow() {
    if (instalments.length >= MAX_INSTALMENTS) return;
    touched();
    setInstalments([...instalments, blankInstalment()]);
  }

  /** Applies a reorder/remove, re-locking whichever row ends up first. */
  function applyRows(next: InstalmentDraft[]) {
    touched();
    const { rows, resetLabel } = lockFirstRow(next);
    setRowNotice(
      resetLabel
        ? `"${resetLabel}" is now the first instalment (booking amount), so its due date was reset to "On booking".`
        : null
    );
    setInstalments(rows);
  }

  function removeRow(key: number) {
    if (instalments.length <= 1) return;
    applyRows(instalments.filter((r) => r.key !== key));
  }

  function moveRow(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= instalments.length) return;
    const next = [...instalments];
    [next[index], next[target]] = [next[target], next[index]];
    applyRows(next);
  }

  function buildPayload(): PaymentPlanCreatePayload {
    return {
      code: code.trim(),
      short_code: shortCode.trim(),
      name: name.trim(),
      description: description.trim() || null,
      project_id: projectId.trim() || null,
      sort_order: Number(sortOrder.trim()),
      instalments: instalments.map((row, i) => ({
        label: row.label.trim(),
        percent: Number(row.percent.trim()),
        // The first instalment is the booking payment — always due on booking.
        due_trigger: i === 0 ? "booking" : row.dueTrigger,
        due_days: i === 0 ? 0 : Number(row.dueDays.trim() || 0),
        charge_head: row.chargeHead || null,
      })),
    };
  }

  async function submit(mode: "preview" | "create") {
    if (!accessToken) return;
    setShowErrors(true);
    setApiError(null);
    if (!isValid) return;
    setSubmitting(mode);
    const sentVersion = formVersion.current;
    try {
      const payload = buildPayload();
      if (mode === "preview") {
        const result = await validatePaymentPlan(accessToken, payload);
        // Edited while the check ran: this result describes an older form, drop it.
        if (formVersion.current === sentVersion) setPreview(result);
      } else {
        const created = await createPaymentPlan(accessToken, payload);
        navigate("/admin/payment-plans", { replace: true, state: { createdCode: created.code ?? payload.code } });
      }
    } catch (e) {
      // A stale preview error is dropped; a failed create is always shown so the
      // admin knows the plan was not saved.
      if (mode === "preview" && formVersion.current !== sentVersion) return;
      if (e instanceof ApiError) setApiError((e.code && API_ERROR_MESSAGES[e.code]) || e.message);
      else setApiError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div>
      <BackLink to="/admin/payment-plans" label="Back to Payment Plans" />
      <PageHeader
        title="Add Payment Plan"
        subtitle="The new plan is active immediately and appears in the customer booking dropdown."
      />

      <div className="space-y-6">
        <Card className="p-5">
          <h2 className="mb-4 text-sm font-bold text-text">Plan Details</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Plan code *"
              placeholder="e.g. PP5/FPP/20-30-50"
              value={code}
              maxLength={CODE_MAX}
              showCount
              onChange={(e) => {
                touched();
                setCode(e.target.value);
              }}
              error={err("code")}
              hint="Unique, permanent identifier. Can't be changed later."
            />
            <TextField
              label="Short code *"
              placeholder="e.g. PP5"
              value={shortCode}
              maxLength={SHORT_CODE_MAX}
              showCount
              onChange={(e) => {
                touched();
                setShortCode(e.target.value);
              }}
              error={err("shortCode")}
            />
            <TextField
              label="Plan name *"
              placeholder="e.g. Flexi Payment Plan 20:30:50"
              value={name}
              maxLength={NAME_MAX}
              showCount
              onChange={(e) => {
                touched();
                setName(e.target.value);
              }}
              error={err("name")}
            />
            <TextField
              label="Project ID"
              placeholder="Leave blank for all projects"
              list="payment-plan-projects"
              value={projectId}
              maxLength={PROJECT_MAX}
              onChange={(e) => {
                touched();
                setProjectId(e.target.value);
              }}
              error={err("projectId")}
              hint="The project this plan is offered for. Blank = all projects."
            />
            <datalist id="payment-plan-projects">
              {projectSuggestions.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
            <TextField
              label="Display order"
              type="number"
              min={0}
              max={1000}
              step={1}
              value={sortOrder}
              onChange={(e) => {
                touched();
                sortOrderSettled.current = true;
                setSortOrder(e.target.value);
              }}
              error={err("sortOrder")}
              hint="Lower numbers appear first in the dropdown."
            />
            <div className="sm:col-span-2">
              <TextArea
                label="Description"
                rows={3}
                maxLength={DESCRIPTION_MAX}
                showCount
                placeholder="Optional — shown to customers with the plan"
                value={description}
                onChange={(e) => {
                  touched();
                  setDescription(e.target.value);
                }}
              />
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-text">Instalments</h2>
              <p className="mt-1 text-xs text-text-muted">
                Percentages are of the Basic Sale Price (BSP) and must total 100%. The first instalment is the
                booking amount and is always due on booking.
              </p>
              <p className="mt-1 text-xs text-text-muted">
                Set each due date as a number of days counted from the booking date or the Offer of Possession date
                — e.g. Booking date + 45 days, Booking date + 90 days, Offer of Possession date + 0 days.
              </p>
            </div>
            <p
              className={
                totalThousandths === 100000 ? "text-sm font-semibold text-success" : "text-sm font-semibold text-warning"
              }
            >
              Total: {formatThousandths(totalThousandths)}
            </p>
          </div>

          <div className="space-y-3">
            {instalments.map((row, i) => {
              const isFirst = i === 0;
              return (
                <div key={row.key} className="rounded-xl border border-border bg-surface-muted/40 p-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold tracking-wide text-text-muted uppercase">
                      Instalment {i + 1}
                      {isFirst && " · Booking amount"}
                    </p>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={i === 0}
                        onClick={() => moveRow(i, -1)}
                        aria-label={`Move instalment ${i + 1} up`}
                      >
                        ↑
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={i === instalments.length - 1}
                        onClick={() => moveRow(i, 1)}
                        aria-label={`Move instalment ${i + 1} down`}
                      >
                        ↓
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={instalments.length <= 1}
                        onClick={() => removeRow(row.key)}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-12">
                    <div className="lg:col-span-4">
                      <TextField
                        label="Label *"
                        placeholder={isFirst ? "Booking Amount" : "e.g. Within 60 days of booking"}
                        value={row.label}
                        maxLength={LABEL_MAX}
                        showCount
                        onChange={(e) => updateRow(row.key, { label: e.target.value })}
                        error={err(`label-${row.key}`)}
                      />
                    </div>
                    <div className="lg:col-span-2">
                      <TextField
                        label="% of BSP *"
                        inputMode="decimal"
                        placeholder="e.g. 10"
                        value={row.percent}
                        onChange={(e) => updateRow(row.key, { percent: e.target.value })}
                        error={err(`percent-${row.key}`)}
                      />
                    </div>
                    <div className="lg:col-span-2">
                      <label htmlFor={`trigger-${row.key}`} className="mb-1.5 block text-sm font-medium text-text">
                        Counted from
                      </label>
                      <Select
                        id={`trigger-${row.key}`}
                        className="w-full"
                        value={isFirst ? "booking" : row.dueTrigger}
                        disabled={isFirst}
                        onChange={(e) => updateRow(row.key, { dueTrigger: e.target.value as PlanDueTrigger })}
                      >
                        <option value="booking">Booking date</option>
                        <option value="possession">Offer of Possession date</option>
                      </Select>
                    </div>
                    <div className="lg:col-span-2">
                      <TextField
                        label="Days later"
                        type="number"
                        min={0}
                        max={MAX_DUE_DAYS}
                        step={1}
                        placeholder="0"
                        value={isFirst ? "0" : row.dueDays}
                        disabled={isFirst}
                        onChange={(e) => updateRow(row.key, { dueDays: e.target.value })}
                        error={err(`days-${row.key}`)}
                      />
                    </div>
                    <div className="lg:col-span-2">
                      <label htmlFor={`charge-${row.key}`} className="mb-1.5 block text-sm font-medium text-text">
                        Add charges
                      </label>
                      <Select
                        id={`charge-${row.key}`}
                        className="w-full"
                        value={row.chargeHead}
                        onChange={(e) => updateRow(row.key, { chargeHead: e.target.value as InstalmentDraft["chargeHead"] })}
                      >
                        <option value="">None</option>
                        <option value="PLC">{CHARGE_HEAD_LABEL.PLC}</option>
                        <option value="IFMS">{CHARGE_HEAD_LABEL.IFMS}</option>
                        <option value="CAM">{CHARGE_HEAD_LABEL.CAM}</option>
                        <option value="ALL">All ({CHARGE_HEAD_LABEL.ALL})</option>
                      </Select>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-text-muted">
                    Due: <span className="font-semibold text-text">{dueSummary(row, isFirst)}</span>
                    {isFirst && (
                      <span className="text-text-soft">
                        {" "}
                        · Locked: the first instalment is the booking amount the customer pays to book the plot, so
                        it is always due on the booking date.
                      </span>
                    )}
                  </p>
                </div>
              );
            })}
          </div>

          {rowNotice && (
            <div className="mt-4 rounded-xl border border-warning/30 bg-warning-bg p-3 text-sm text-warning">
              {rowNotice}
            </div>
          )}

          {showErrors && (fieldErrors.instalments || fieldErrors.chargeHeads) && (
            <div className="mt-4 space-y-1 rounded-xl border border-danger/30 bg-danger-bg p-3 text-sm text-danger">
              {fieldErrors.instalments && <p>{fieldErrors.instalments}</p>}
              {fieldErrors.chargeHeads && <p>{fieldErrors.chargeHeads}</p>}
            </div>
          )}

          <div className="mt-4">
            <Button type="button" variant="outline" onClick={addRow} disabled={instalments.length >= MAX_INSTALMENTS}>
              + Add Instalment
            </Button>
            {instalments.length >= MAX_INSTALMENTS && (
              <p className="mt-1.5 text-xs text-text-soft">Maximum {MAX_INSTALMENTS} instalments.</p>
            )}
          </div>
        </Card>

        {apiError && (
          <div className="rounded-xl border border-danger/30 bg-danger-bg p-3 text-sm text-danger">{apiError}</div>
        )}
        {showErrors && !isValid && !apiError && (
          <div className="rounded-xl border border-danger/30 bg-danger-bg p-3 text-sm text-danger">
            Please fix the highlighted fields.
          </div>
        )}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate("/admin/payment-plans")}
            disabled={!!submitting}
          >
            Cancel
          </Button>
          <Button type="button" variant="outline" onClick={() => submit("preview")} disabled={!!submitting}>
            {submitting === "preview" ? "Checking..." : "Preview"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => submit("create")} disabled={!!submitting}>
            {submitting === "create" ? "Creating..." : "Create Payment Plan"}
          </Button>
        </div>

        {preview && (
          <div>
            <h2 className="mb-1 text-base font-bold text-text">Preview</h2>
            <p className="mb-4 text-sm text-text-muted">
              The plan is valid. This is how it will look — nothing has been saved yet.
            </p>
            <PlanDetails plan={preview} showMeta={false} />
          </div>
        )}
      </div>
    </div>
  );
}
