import type { ApiVisit, BrokerProject } from "./api";
import { formatDate } from "./format";

export type VisitDisplayStatus = "scheduled" | "completed" | "cancelled";

export function projectLabel(project: BrokerProject | null): string {
  if (project === "suraksha-enclave") return "Suraksha Enclave";
  if (project === "ops-divine-greens") return "Ops Divine Greens";
  return "—";
}

export function deriveStatus(v: ApiVisit): VisitDisplayStatus {
  if (v.status === "cancelled") return "cancelled";
  const date = v.visit_date ? new Date(v.visit_date) : null;
  if (date && !Number.isNaN(date.getTime())) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (date < today) return "completed";
  }
  return "scheduled";
}

export function scheduleLabel(v: ApiVisit): string {
  if (v.status === "requested" || !v.visit_time || !v.visit_date) {
    return v.preferred_window ? `Requested · ${v.preferred_window}` : "Awaiting confirmation";
  }
  return `${formatDate(v.visit_date)} · ${v.visit_time}`;
}

/** Sortable timestamp for a visit, combining visit_date + visit_time (midnight when time is missing). */
export function visitTimestamp(v: ApiVisit): number {
  if (!v.visit_date) return Number.POSITIVE_INFINITY;
  const date = new Date(`${v.visit_date}T${v.visit_time ?? "00:00"}`);
  return Number.isNaN(date.getTime()) ? Number.POSITIVE_INFINITY : date.getTime();
}
