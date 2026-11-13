import type { Tone } from "../../components/ui/StatusBadge";
import type { ApiInventoryProject, InventoryStatus, InventoryStatusLock } from "../../lib/api";
import { titleCase } from "../../lib/format";

export const INVENTORY_STATUS_LABELS: Record<InventoryStatus, string> = {
  available: "Available",
  held: "On Hold",
  reserved: "Reserved by Partner",
  pending_kyc_review: "Booked (KYC Review)",
  booked: "Booked",
  sold: "Sold",
};

/** Green for free plots, red for taken ones, amber/blue for plots in between. */
const INVENTORY_STATUS_TONES: Record<InventoryStatus, Tone> = {
  available: "success",
  held: "warning",
  reserved: "info",
  pending_kyc_review: "warning",
  booked: "danger",
  sold: "danger",
};

export function inventoryStatusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  return INVENTORY_STATUS_LABELS[status as InventoryStatus] ?? titleCase(status);
}

export function inventoryStatusTone(status: string): Tone {
  return INVENTORY_STATUS_TONES[status as InventoryStatus] ?? "neutral";
}

/** What triggered a status change, as recorded by the backend. */
const SOURCE_LABELS: Record<string, string> = {
  admin_panel: "Changed in admin panel",
  partner_reservation: "Channel partner reserved it",
  partner_release: "Channel partner released it",
  partner_sale: "Channel partner sold it",
  reservation_expiry: "Partner reservation expired",
  booking_payment: "Booking payment received",
  kyc_approval: "Booking approved",
  kyc_rejection: "Booking rejected",
  booking_cancellation: "Booking cancelled",
  staff_repair: "Manual booking repair",
  inventory_ingest: "Inventory upload",
  sheet_sync: "Inventory sheet sync",
  sync_rollback: "Sheet sync undone",
  test_booking_cleanup: "Test booking cleared",
};

export function changeSourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? titleCase(source);
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  broker: "Channel Partner",
  customer: "Customer",
  system: "System",
};

export function changedByRoleLabel(role: string): string {
  return ROLE_LABELS[role] ?? titleCase(role);
}

export const STATUS_LOCK_MESSAGES: Record<InventoryStatusLock, string> = {
  partner_reservation:
    "A channel partner has reserved this plot. It becomes available again when they release it or the reservation expires.",
  booking:
    "This plot is booked through the website. Change it from the booking: approve, reject or cancel it in the Bookings section.",
  buyer_linked: "This plot is linked to a buyer's account, so its status can't be changed here.",
};

/** The four headline numbers for a project. */
export function projectTotals(project: ApiInventoryProject | undefined) {
  if (!project) return { total: 0, available: 0, sold: 0, onHold: 0 };
  return {
    total: project.total,
    available: project.available,
    sold: project.sold + project.booked,
    onHold: project.held + project.reserved + project.pending_kyc_review,
  };
}

function trimNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
}

export function plotSize(width: number | null, length: number | null): string {
  if (width == null || length == null) return "—";
  return `${trimNumber(width)} × ${trimNumber(length)} m`;
}

export function plotArea(sqm: number | null, sqyd: number | null): string {
  const parts = [];
  if (sqm != null) parts.push(`${trimNumber(sqm)} sq m`);
  if (sqyd != null) parts.push(`${trimNumber(sqyd)} sq yd`);
  return parts.length ? parts.join(" · ") : "—";
}
