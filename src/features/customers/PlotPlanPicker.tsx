import { useEffect, useState, type FormEvent } from "react";
import { Button } from "../../components/ui/Button";
import { ApiError, listAdminPaymentPlans, type ApiPaymentPlan } from "../../lib/api";

/** "PP1 — Flexi Plan", falling back to the plan code. */
function planName(plan: ApiPaymentPlan) {
  return [plan.short_code, plan.name].filter(Boolean).join(" — ") || plan.code;
}

/**
 * The plans the company offers today: the newest active, valid version of each plan code,
 * in the order the plans page uses.
 */
export function offeredPlans(plans: ApiPaymentPlan[]): ApiPaymentPlan[] {
  const newest = new Map<string, ApiPaymentPlan>();
  for (const p of plans) {
    if (p.is_active === false || p.valid === false) continue;
    const seen = newest.get(p.code);
    if (!seen || p.version > seen.version) newest.set(p.code, p);
  }
  return [...newest.values()].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || planName(a).localeCompare(planName(b), undefined, { numeric: true })
  );
}

/**
 * Lists every payment plan the company offers so the admin can move a plot to another one.
 * The plot keeps its booking date and prices; only the plan changes.
 */
export function PlotPlanPicker({
  accessToken,
  currentCode,
  saving,
  error,
  onSave,
  onCancel,
}: {
  accessToken: string;
  /** The plot's current plan code, marked and pre-selected. */
  currentCode: string | null;
  saving: boolean;
  error: string | null;
  /** Called with the chosen plan's short code (or code when it has none). */
  onSave: (planRef: string) => void;
  onCancel: () => void;
}) {
  const [plans, setPlans] = useState<ApiPaymentPlan[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<string | null>(currentCode);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    setPlans(null);
    listAdminPaymentPlans(accessToken)
      .then((res) => {
        if (!cancelled) setPlans(offeredPlans(Array.isArray(res.plans) ? res.plans : []));
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof ApiError ? err.message : "The payment plans could not be loaded.");
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, reload]);

  const chosen = plans?.find((p) => p.code === selected) ?? null;
  const unchanged = !chosen || chosen.code === currentCode;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (chosen && !unchanged) onSave(chosen.short_code || chosen.code);
  }

  return (
    <form onSubmit={submit} className="space-y-4" aria-label="Change payment plan">
      {loadError ? (
        <div role="alert" className="rounded-lg border border-danger/30 bg-danger-bg p-3 text-sm text-danger">
          {loadError}{" "}
          <button type="button" className="font-semibold underline" onClick={() => setReload((n) => n + 1)}>
            Try again
          </button>
        </div>
      ) : plans === null ? (
        <p className="text-sm text-text-muted">Loading payment plans...</p>
      ) : plans.length === 0 ? (
        <p className="text-sm text-text-muted">There are no active payment plans. Add one under Payment Plans first.</p>
      ) : (
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-text">Choose the payment plan for this plot</legend>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {plans.map((plan) => {
              const isSelected = plan.code === selected;
              const isCurrent = plan.code === currentCode;
              return (
                <label
                  key={plan.code}
                  className={`flex cursor-pointer gap-3 rounded-xl border p-4 transition-colors ${
                    isSelected ? "border-gold bg-gold/5" : "border-border hover:border-gold/60"
                  }`}
                >
                  <input
                    type="radio"
                    name="payment-plan"
                    value={plan.code}
                    checked={isSelected}
                    onChange={() => setSelected(plan.code)}
                    className="mt-1 accent-gold"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-text">{planName(plan)}</span>
                      {isCurrent && (
                        <span className="rounded-full bg-gold/15 px-2 py-0.5 text-xs font-semibold text-gold-dark">
                          Current plan
                        </span>
                      )}
                    </span>
                    {plan.description && <span className="mt-1 block text-xs text-text-muted">{plan.description}</span>}
                    {plan.instalments && plan.instalments.length > 0 && (
                      <ol className="mt-2 space-y-0.5 text-xs text-text">
                        {plan.instalments.map((i) => (
                          <li key={i.seq} className="flex justify-between gap-3">
                            <span className="text-text-muted">{i.label}</span>
                            <span className="shrink-0 font-semibold">{i.percent}%</span>
                          </li>
                        ))}
                      </ol>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      {chosen && !unchanged && (
        <p role="status" className="rounded-lg bg-warning-bg p-3 text-sm text-warning">
          The instalments will be rebuilt from {planName(chosen)} using this plot's booking date and prices. The amount
          received so far is marked against the new instalments, oldest first, and the demand letter is updated.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={saving || unchanged}>
          {saving ? "Saving..." : "Change plan"}
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
