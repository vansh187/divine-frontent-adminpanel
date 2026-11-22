/** Helpers over the admin plan list, which holds every version of every plan. */
import type { ApiPaymentPlan } from "../../lib/api";
import type { PlotUsage } from "./PlanDetails";

/**
 * One entry per plan code: the active version, else the newest. The API returns
 * every version, newest first within each code. This is also the version the server
 * switches on or off, or edits, for that code.
 */
export function currentPlanVersions(plans: ApiPaymentPlan[]): ApiPaymentPlan[] {
  const byCode = new Map<string, ApiPaymentPlan>();
  for (const plan of plans) {
    const existing = byCode.get(plan.code);
    if (!existing) {
      byCode.set(plan.code, plan);
    } else if (!existing.is_active && (plan.is_active || plan.version > existing.version)) {
      byCode.set(plan.code, plan);
    }
  }
  return [...byCode.values()].sort((a, b) => {
    if (!!a.is_active !== !!b.is_active) return a.is_active ? -1 : 1;
    const order = (a.sort_order ?? 0) - (b.sort_order ?? 0);
    return order !== 0 ? order : a.code.localeCompare(b.code);
  });
}

/**
 * Plots currently on a plan code, over all its versions: customers keep the version they
 * booked on, so older versions still count. Null when the backend doesn't send counts yet.
 */
export function plotUsage(plans: ApiPaymentPlan[], code: string): PlotUsage | null {
  const versions = plans.filter((p) => p.code === code && typeof p.plots_count === "number");
  if (versions.length === 0) return null;
  const byVersion = versions
    .map((p) => ({ version: p.version, count: p.plots_count as number }))
    .sort((a, b) => a.version - b.version);
  return { total: byVersion.reduce((sum, v) => sum + v.count, 0), byVersion };
}

export function plotsText(count: number) {
  return `${count} plot${count === 1 ? "" : "s"}`;
}

/** "PP1 — Flexi Plan", falling back to the plan code. */
export function planName(plan: ApiPaymentPlan) {
  return [plan.short_code, plan.name].filter(Boolean).join(" — ") || plan.code;
}

/** Where a plan is edited. Codes contain "/", so the code travels as a query parameter. */
export function editPlanPath(code: string) {
  return `/admin/payment-plans/edit?code=${encodeURIComponent(code)}`;
}

/** What the Payment Plans page is told when the admin arrives from saving a plan. */
export interface PlansPageState {
  createdCode?: string;
  /** A plan that was just edited: selected on arrival, with `notice` above it. */
  edited?: { code: string; notice: string };
}
