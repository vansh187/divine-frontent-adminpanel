import { useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Select } from "../../components/ui/Select";
import { TextArea } from "../../components/ui/TextArea";
import { TextField } from "../../components/ui/TextField";
import { validatePaymentPlan, type ApiPaymentPlan, type PaymentPlanCreatePayload } from "../../lib/api";
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
  dueDateNote,
  dueSummary,
  formatThousandths,
  planSubmitErrorMessage,
  totalThousandths as sumThousandths,
  type InstalmentDraft,
  type PlanFormValues,
} from "./planForm";
import { CHARGE_HEAD_OPTIONS } from "./planLabels";

/** The plan fields, instalment rows, preview and save buttons shared by the Add and Edit pages. */
export function PaymentPlanForm({
  accessToken,
  initialValues,
  existingPlans,
  validate,
  buildPayload,
  save,
  submitLabel,
  submittingLabel,
  lockCode = false,
  canSubmit,
  footnote,
}: {
  accessToken: string | null;
  /** Read once, when the form first renders. */
  initialValues: PlanFormValues;
  /** Feeds the project suggestions. */
  existingPlans: ApiPaymentPlan[];
  /** Field errors keyed as in validatePlanForm. */
  validate: (values: PlanFormValues) => Record<string, string>;
  /** The whole plan: what Preview checks, and what `save` gets. */
  buildPayload: (values: PlanFormValues) => PaymentPlanCreatePayload;
  /** Saves and leaves the page. What it throws is shown in the form. */
  save: (token: string, values: PlanFormValues, payload: PaymentPlanCreatePayload) => Promise<void>;
  submitLabel: string | ((values: PlanFormValues) => string);
  submittingLabel: string;
  /** Editing: the plan code is permanent. */
  lockCode?: boolean;
  canSubmit?: (values: PlanFormValues) => boolean;
  /** Shown above the buttons, e.g. what saving will do. */
  footnote?: (values: PlanFormValues) => ReactNode;
}) {
  const navigate = useNavigate();
  const [values, setValues] = useState(initialValues);
  const { code, shortCode, name, description, projectId, instalments } = values;

  const [showErrors, setShowErrors] = useState(false);
  const [submitting, setSubmitting] = useState<"preview" | "save" | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ApiPaymentPlan | null>(null);

  // Bumped on every edit. An async preview/error is only applied if the form is
  // unchanged since the request went out, so a late response can't show stale data.
  const formVersion = useRef(0);

  const projectSuggestions = useMemo(
    () => [...new Set(existingPlans.map((p) => p.project_id).filter((p): p is string => !!p))],
    [existingPlans]
  );

  const totalThousandths = sumThousandths(instalments);
  const fieldErrors = validate(values);
  const isValid = Object.keys(fieldErrors).length === 0;
  const err = (key: string) => (showErrors ? fieldErrors[key] ?? null : null);

  // ---- form helpers -------------------------------------------------------------
  // Any edit invalidates a previous preview so it can never show stale numbers.
  function change(patch: (current: PlanFormValues) => Partial<PlanFormValues>) {
    formVersion.current += 1;
    setPreview(null);
    setApiError(null);
    setValues((current) => ({ ...current, ...patch(current) }));
  }

  function updateRow(key: number, patch: Partial<InstalmentDraft>) {
    change((v) => ({ instalments: v.instalments.map((r) => (r.key === key ? { ...r, ...patch } : r)) }));
  }

  function addRow() {
    if (instalments.length >= MAX_INSTALMENTS) return;
    change((v) => ({ instalments: [...v.instalments, blankInstalment()] }));
  }

  function removeRow(key: number) {
    if (instalments.length <= 1) return;
    change((v) => ({ instalments: v.instalments.filter((r) => r.key !== key) }));
  }

  function moveRow(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= instalments.length) return;
    const next = [...instalments];
    [next[index], next[target]] = [next[target], next[index]];
    change(() => ({ instalments: next }));
  }

  async function submit(mode: "preview" | "save") {
    if (!accessToken) return;
    setShowErrors(true);
    setApiError(null);
    if (!isValid) return;
    setSubmitting(mode);
    const sentVersion = formVersion.current;
    const payload = buildPayload(values);
    try {
      if (mode === "preview") {
        const result = await validatePaymentPlan(accessToken, payload);
        // Edited while the check ran: this result describes an older form, drop it.
        if (formVersion.current === sentVersion) setPreview(result);
      } else {
        await save(accessToken, values, payload);
      }
    } catch (e) {
      // A stale preview error is dropped; a failed save is always shown so the
      // admin knows the plan was not saved.
      if (mode === "preview" && formVersion.current !== sentVersion) return;
      setApiError(planSubmitErrorMessage(e, payload));
    } finally {
      setSubmitting(null);
    }
  }

  return (
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
            onChange={(e) => change(() => ({ code: e.target.value }))}
            error={err("code")}
            disabled={lockCode}
            className={lockCode ? "cursor-not-allowed bg-surface-muted text-text-muted" : undefined}
            hint={lockCode ? "The plan code is permanent and can't be changed." : "Unique, permanent identifier. Can't be changed later."}
          />
          <TextField
            label="Short code *"
            placeholder="e.g. PP5"
            value={shortCode}
            maxLength={SHORT_CODE_MAX}
            showCount
            onChange={(e) => change(() => ({ shortCode: e.target.value }))}
            error={err("shortCode")}
          />
          <TextField
            label="Plan name *"
            placeholder="e.g. Flexi Payment Plan 20:30:50"
            value={name}
            maxLength={NAME_MAX}
            showCount
            onChange={(e) => change(() => ({ name: e.target.value }))}
            error={err("name")}
          />
          <TextField
            label="Project ID"
            placeholder="Leave blank for all projects"
            list="payment-plan-projects"
            value={projectId}
            maxLength={PROJECT_MAX}
            onChange={(e) => change(() => ({ projectId: e.target.value }))}
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
              onChange={(e) => change(() => ({ description: e.target.value }))}
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

      {footnote?.(values)}

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
        <Button
          type="button"
          variant="secondary"
          onClick={() => submit("save")}
          disabled={!!submitting || canSubmit?.(values) === false}
        >
          {submitting === "save" ? submittingLabel : typeof submitLabel === "function" ? submitLabel(values) : submitLabel}
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
  );
}
