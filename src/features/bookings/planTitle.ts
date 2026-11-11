import type { ApiBookingPlanSnapshot } from "../../lib/api";

/** "Plan name (SHORT) · v2", from whatever parts of the booking's plan snapshot are present. */
export function planTitle(plan: ApiBookingPlanSnapshot | null | undefined) {
  if (!plan) return null;
  const name = plan.name?.trim() || null;
  const shortCode = plan.short_code?.trim() || null;
  const code = plan.code?.trim() || null;
  const main = name ?? code ?? shortCode;
  if (!main) return null;
  // The bracketed code is skipped when it would just repeat the main text.
  const tag = [shortCode, code].find((c) => c && c.toLowerCase() !== main.toLowerCase()) ?? null;
  const version = plan.version ? ` · v${plan.version}` : "";
  return `${main}${tag ? ` (${tag})` : ""}${version}`;
}
