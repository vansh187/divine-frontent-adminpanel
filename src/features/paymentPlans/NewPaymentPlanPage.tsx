import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BackLink } from "../../components/ui/BackLink";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { Select } from "../../components/ui/Select";
import { TextArea } from "../../components/ui/TextArea";
import { TextField } from "../../components/ui/TextField";
import { createPaymentPlan, listAdminPaymentPlans, validatePaymentPlan, type ApiPaymentPlan } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { PlanDetails } from "./PlanDetails";
import {
  BOOKING_DATE,
  CODE_MAX,
  COUNTED_FROM_MAX,
  DESCRIPTION_MAX,
  LABEL_MAX,
  MAX_INSTALMENTS,
  NAME_MAX,
  POSSESSION_DATE,
  PROJECT_MAX,
  SHORT_CODE_MAX,
  blankInstalment,
  buildPlanPayload,
  dueDateNote,
  dueSummary,
  formatThousandths,
  planSubmitErrorMessage,
  totalThousandths as sumThousandths,
  validatePlanForm,
  type InstalmentDraft,
} from "./planForm";
import { CHARGE_HEAD_OPTIONS } from "./planLabels";

export function NewPaymentPlanPage() {
  const { accessToken } = useAuth();
  const navigate = useNavigate();

  const [code, setCode] = useState("");
  const [shortCode, setShortCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState("");
  const [instalments, setInstalments] = useState<InstalmentDraft[]>(() => [
    blankInstalment({ label: "Booking Amount" }),
    blankInstalment(),
  ]);

  const [existingPlans, setExistingPlans] = useState<ApiPaymentPlan[]>([]);
  const [showErrors, setShowErrors] = useState(false);
  const [submitting, setSubmitting] = useState<"preview" | "create" | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ApiPaymentPlan | null>(null);

  // Bumped on every edit. An async preview/error is only applied if the form is
  // unchanged since the request went out, so a late response can't show stale data.
  const formVersion = useRef(0);

  // Existing plans feed the project suggestions, duplicate checks and the new plan's
  // position in the dropdown. Project is never pre-filled: blank means "all projects".
  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    listAdminPaymentPlans(accessToken)
      .then((res) => {
        if (cancelled || !Array.isArray(res.plans)) return;
        setExistingPlans(res.plans);
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

  const totalThousandths = sumThousandths(instalments);
  const formValues = { code, shortCode, name, description, projectId, instalments };

  // ---- validation -----------------------------------------------------------
  const fieldErrors = useMemo(
    () => validatePlanForm({ code, shortCode, name, description, projectId, instalments }, existingPlans),
    [code, shortCode, name, description, projectId, instalments, existingPlans]
  );

  const isValid = Object.keys(fieldErrors).length === 0;
  const err = (key: string) => (showErrors ? fieldErrors[key] ?? null : null);

  // ---- form helpers -------------------------------------------------------------
  // Any edit invalidates a previous preview so it can never show stale numbers.
  function touched() {
    formVersion.current += 1;
    setPreview(null);
    setApiError(null);
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

  function applyRows(next: InstalmentDraft[]) {
    touched();
    setInstalments(next);
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

  async function submit(mode: "preview" | "create") {
    if (!accessToken) return;
    setShowErrors(true);
    setApiError(null);
    if (!isValid) return;
    setSubmitting(mode);
    const sentVersion = formVersion.current;
    const payload = buildPlanPayload(formValues, existingPlans);
    try {
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
      setApiError(planSubmitErrorMessage(e, payload));
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
                booking amount.
              </p>
              <p className="mt-1 text-xs text-text-muted">
                Each due date is a number of days after the event in "Counted from", and you can type any event — e.g.
                Booking date + 45 days, Offer of Possession date + 0 days, Completion of plinth + 30 days. Due dates are
                calculated automatically only for the booking date and the Offer of Possession date.
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

          <datalist id="payment-plan-counted-from">
            <option value={BOOKING_DATE} />
            <option value={POSSESSION_DATE} />
          </datalist>

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
                      <TextField
                        label="Counted from *"
                        list="payment-plan-counted-from"
                        placeholder="e.g. Booking date"
                        value={row.countedFrom}
                        maxLength={COUNTED_FROM_MAX}
                        onChange={(e) => updateRow(row.key, { countedFrom: e.target.value })}
                        error={err(`from-${row.key}`)}
                      />
                    </div>
                    <div className="lg:col-span-2">
                      <TextField
                        label="Days later"
                        inputMode="numeric"
                        placeholder="0"
                        value={row.dueDays}
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
                        {CHARGE_HEAD_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-text-muted">
                    Due: <span className="font-semibold text-text">{dueSummary(row)}</span>
                    <span className="text-text-soft"> · {dueDateNote(row)}</span>
                  </p>
                </div>
              );
            })}
          </div>

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
