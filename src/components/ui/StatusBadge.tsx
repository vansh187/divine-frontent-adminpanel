import clsx from "clsx";
import { titleCase } from "../../lib/format";

type Tone = "success" | "warning" | "danger" | "info" | "neutral";

const TONE_CLASSES: Record<Tone, string> = {
  success: "bg-success-bg text-success",
  warning: "bg-warning-bg text-warning",
  danger: "bg-danger-bg text-danger",
  info: "bg-info-bg text-info",
  neutral: "bg-neutral-bg text-text-muted",
};

const STATUS_TONE: Record<string, Tone> = {
  // Booking
  PAYMENT_RECEIVED: "info",
  KYC_PENDING: "warning",
  PENDING_KYC_REVIEW: "warning",
  UNDER_REVIEW: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  CANCELLED: "neutral",
  REFUND_IN_PROGRESS: "warning",
  REFUNDED: "info",
  // Plot
  AVAILABLE: "success",
  ON_HOLD: "warning",
  BOOKED: "success",
  RELEASE_PENDING: "warning",
  AVAILABLE_AFTER_CANCEL: "info",
  // KYC
  PENDING: "warning",
  VERIFIED: "success",
  NEEDS_RESUBMISSION: "danger",
  // Payment
  INITIATED: "info",
  AUTHORIZED: "info",
  CAPTURED: "success",
  FAILED: "danger",
  CASH_RECORDED: "info",
  REFUND_PENDING: "warning",
  PARTIALLY_REFUNDED: "warning",
  // Refund
  PROCESSING: "warning",
  COMPLETED: "success",
  CASH_REFUND_PENDING: "warning",
  CASH_COLLECTED: "success",
  NOT_REQUIRED: "neutral",
  // Visit
  SCHEDULED: "info",
  CONFIRMED: "info",
  NO_SHOW: "danger",
  FOLLOW_UP_REQUIRED: "warning",
  CONVERTED: "success",
  // Customer / Broker status
  LEAD: "info",
  ACTIVE: "success",
  INACTIVE: "neutral",
  // Settlement
  UNDER_REVIEW_SETTLEMENT: "warning",
  PAID: "success",
  REVERSED: "neutral",
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const tone = STATUS_TONE[status] ?? "neutral";
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap",
        TONE_CLASSES[tone]
      )}
    >
      {label ?? titleCase(status)}
    </span>
  );
}
