import { titleCase } from "./format";

/** How each payment method is named across the panel and its CSV exports. */
export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  razorpay: "Razorpay",
  zoho: "Zoho Payments",
  cash: "Cash",
  rtgs_neft: "RTGS/NEFT",
  cheque: "Cheque",
  offline: "Offline",
};

export function paymentMethodLabel(method: string | null | undefined): string {
  return method ? (PAYMENT_METHOD_LABELS[method] ?? titleCase(method)) : "";
}
