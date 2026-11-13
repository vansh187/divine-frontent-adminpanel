import type { ApiCustomer } from "../../lib/api";

/**
 * Which plot is on which payment plan, for the customers list: one line per plot,
 * e.g. "D7 · PP1 · Mr. Rohit Mehra" (a plot with no plan linked yet shows "—"). Each
 * plot shows its own applicant: buyers who share an email share one account. Falls back to the
 * plan codes alone on a backend that doesn't send plot_plans.
 */
export function PlotPlans({ customer }: { customer: ApiCustomer }) {
  const plots = customer.plot_plans ?? [];
  if (plots.length === 0) {
    const plans = customer.payment_plans ?? [];
    return <span className="text-text">{plans.length ? plans.join(", ") : "—"}</span>;
  }
  return (
    <ul className="space-y-0.5 text-sm">
      {plots.map((plot, i) => (
        <li key={`${plot.project_name}-${plot.unit_number}-${i}`} title={plot.project_name ?? undefined}>
          <span className="font-semibold text-text">{plot.unit_number ?? "Plot"}</span>
          <span className="text-text-muted"> · </span>
          <span className={plot.payment_plan ? "text-text" : "text-text-muted"}>{plot.payment_plan ?? "—"}</span>
          {plot.applicant_name && <span className="text-xs text-text-muted"> · {plot.applicant_name}</span>}
        </li>
      ))}
    </ul>
  );
}
