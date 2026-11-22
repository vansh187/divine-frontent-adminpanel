/** The booking list's money rules, shared by the table and its CSV export so both always agree. */
import type { ApiBookingListItem } from "../../lib/api";

/**
 * Money held for a booking. The server sends `amount_received` once a booked plot has a
 * schedule; until then the booking amount is what was paid. A rejected or cancelled booking
 * holds nothing: its money is being, or has been, refunded.
 */
export function receivedAmount(b: ApiBookingListItem): number | null {
  if (b.status !== "booked" && b.status !== "pending_kyc_review") return null;
  return b.amount_received ?? b.amount ?? null;
}

/** When the next payment is due: its date, else its event's wording. Null when nothing is left to pay. */
export function nextPaymentDue(b: ApiBookingListItem): string | null {
  const next = b.next_payment;
  return next ? next.due_date || next.due_text || "Not dated yet" : null;
}
