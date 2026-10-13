import { useState } from "react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Modal } from "../../components/ui/Modal";
import { Select } from "../../components/ui/Select";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Table, Td, Th, THead, Tr } from "../../components/ui/Table";
import { TextField } from "../../components/ui/TextField";
import {
  ApiError,
  recordInstallmentPayment,
  type ApiBookingDetail,
  type ApiPaymentMilestone,
  type InstallmentPaymentMethod,
} from "../../lib/api";
import { formatCurrency, formatDate, formatDateTime } from "../../lib/format";

const METHOD_LABEL: Record<InstallmentPaymentMethod, string> = {
  cash: "Cash",
  cheque: "Cheque",
  rtgs_neft: "RTGS / NEFT",
};

const RECORD_ERROR_MESSAGES: Record<string, string> = {
  utr_number_required: "Enter the UTR number for an RTGS / NEFT payment.",
  cheque_number_required: "Enter the cheque number for a cheque payment.",
  installment_out_of_order: "Earlier installments must be recorded before this one.",
  installment_not_payable: "This installment cannot be paid yet.",
  installment_amount_mismatch: "The amount does not match this installment.",
  milestone_not_found: "This installment could not be found.",
  invalid_method: "Choose a valid payment method.",
};

// Codes meaning the page is showing stale data — the parent reloads the booking.
const STALE_ERROR_MESSAGES: Record<string, string> = {
  installment_already_paid: "This installment was already recorded — showing the latest state.",
  booking_not_booked: "This booking is no longer booked — showing the latest state.",
};

const NOTE_MAX_LENGTH = 500;

/** Today's date as YYYY-MM-DD in the admin's local timezone. */
function todayLocal() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Whether a milestone's pay_enabled_from has passed. A bare date ("2026-02-10") is a
 * calendar day and compared as one; a full timestamp is compared as an instant so a
 * UTC value isn't shifted onto the wrong local day. Missing or unparseable values
 * leave the decision to the server rather than blocking the admin.
 */
function isPayableNow(payEnabledFrom: string | null | undefined) {
  if (!payEnabledFrom) return true;
  if (/^\d{4}-\d{2}-\d{2}$/.test(payEnabledFrom)) return payEnabledFrom <= todayLocal();
  const time = new Date(payEnabledFrom).getTime();
  return Number.isNaN(time) || time <= Date.now();
}

function dueInText(days: number | null | undefined) {
  if (typeof days !== "number") return null;
  if (days === 0) return "Due today";
  if (days > 0) return `Due in ${days} day${days === 1 ? "" : "s"}`;
  return `Overdue by ${-days} day${days === -1 ? "" : "s"}`;
}

interface PaymentPlanCardProps {
  accessToken: string;
  booking: ApiBookingDetail;
  onUpdated: (booking: ApiBookingDetail) => void;
  /** Called when the server says our view is out of date; the parent should reload. */
  onStale: (message: string) => void;
}

export function PaymentPlanCard({ accessToken, booking, onUpdated, onStale }: PaymentPlanCardProps) {
  const [milestone, setMilestone] = useState<ApiPaymentMilestone | null>(null);
  const [method, setMethod] = useState<InstallmentPaymentMethod>("cash");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const schedule = Array.isArray(booking.payment_schedule) ? booking.payment_schedule : [];
  const nextDue = booking.next_due ?? null;
  // Milestones are paid in order, so only the earliest unpaid one can be recorded.
  // Prefer the server's next_due, falling back to the first unpaid row if it's absent.
  const nextPayableId = nextDue?.milestone_id ?? schedule.find((m) => m.status !== "paid")?.id ?? null;

  const totalAmount = schedule.reduce((sum, m) => sum + (Number(m.amount) || 0), 0);
  const received =
    booking.amount_received ??
    schedule.filter((m) => m.status === "paid").reduce((sum, m) => sum + (Number(m.amount) || 0), 0);
  const outstanding = Math.max(0, totalAmount - received);
  const paidPercent = totalAmount > 0 ? Math.min(100, (received / totalAmount) * 100) : 0;

  function openRecord(row: ApiPaymentMilestone) {
    setMethod("cash");
    setReference("");
    setNote("");
    setFormError(null);
    setNotice(null);
    setMilestone(row);
  }

  function closeRecord() {
    if (submitting) return;
    setMilestone(null);
    setFormError(null);
  }

  const referenceRequired = method !== "cash";
  const canSubmit = !referenceRequired || !!reference.trim();

  async function submitRecord() {
    if (!milestone) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const result = await recordInstallmentPayment(accessToken, booking.id, milestone.id, {
        amount: milestone.amount,
        method,
        utr_number: method === "rtgs_neft" ? reference.trim() : undefined,
        cheque_number: method === "cheque" ? reference.trim() : undefined,
        note: note.trim() || undefined,
      });
      setMilestone(null);
      setNotice(`${milestone.label} recorded as received via ${METHOD_LABEL[method]}.`);
      onUpdated(result);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined;
      if (code && STALE_ERROR_MESSAGES[code]) {
        setMilestone(null);
        onStale(STALE_ERROR_MESSAGES[code]);
      } else {
        setFormError((code && RECORD_ERROR_MESSAGES[code]) || "Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="p-5">
      <h3 className="mb-4 text-sm font-bold text-text">Payment Plan</h3>

      {schedule.length === 0 ? (
        <p className="text-sm text-text-muted">
          Payment plan not available yet — the booking application has not been uploaded for this booking.
        </p>
      ) : (
        <>
          {notice && (
            <div className="mb-4 rounded-xl border border-success/30 bg-success-bg p-3 text-sm text-success">
              {notice}
            </div>
          )}

          {nextDue && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-muted/60 p-3">
              <div>
                <p className="text-xs text-text-muted">Next due</p>
                <p className="text-sm font-semibold text-text">
                  {nextDue.label} · {formatCurrency(nextDue.amount)}
                </p>
                <p className="text-xs text-text-muted">
                  {[formatDate(nextDue.due_date), dueInText(nextDue.days_until_due)].filter(Boolean).join(" · ")}
                </p>
                {nextDue.last_reminder_at && (
                  <p className="mt-0.5 text-xs text-text-soft">
                    Last reminder sent {formatDateTime(nextDue.last_reminder_at)}
                  </p>
                )}
              </div>
              {nextDue.status && <StatusBadge status={nextDue.status.toUpperCase()} />}
            </div>
          )}

          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-text-muted">Total Plan Value</dt>
              <dd className="font-semibold text-text">{formatCurrency(totalAmount)}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">Received</dt>
              <dd className="font-semibold text-success">{formatCurrency(received)}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">Outstanding</dt>
              <dd className="font-semibold text-text">{formatCurrency(outstanding)}</dd>
            </div>
          </dl>

          <div className="mt-4 mb-5">
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
              <div className="h-full rounded-full bg-gold" style={{ width: `${paidPercent}%` }} />
            </div>
            <p className="mt-1 text-xs text-text-soft">{Math.round(paidPercent)}% of the plan received</p>
          </div>

          <Table>
            <THead>
              <Th>Milestone</Th>
              <Th>Due Date</Th>
              <Th>Amount</Th>
              <Th>Status</Th>
              <Th>Payment</Th>
              <Th>Action</Th>
            </THead>
            <tbody>
              {schedule.map((row) => {
                const isNext = row.id === nextPayableId;
                const payable = isPayableNow(row.pay_enabled_from);
                return (
                  <Tr key={row.id}>
                    <Td>
                      <p className="font-medium">{row.label}</p>
                      {typeof row.percent === "number" && (
                        <p className="text-xs text-text-muted">{row.percent}% of plot value</p>
                      )}
                    </Td>
                    <Td>{formatDate(row.due_date)}</Td>
                    <Td className="font-semibold">{formatCurrency(Number(row.amount) || 0)}</Td>
                    <Td>{row.status ? <StatusBadge status={row.status.toUpperCase()} /> : "-"}</Td>
                    <Td>
                      {row.status === "paid" ? (
                        <div className="text-xs">
                          <p className="font-medium text-text">{formatDateTime(row.paid_on)}</p>
                          {row.paid_payment_id && <p className="text-text-muted">{row.paid_payment_id}</p>}
                        </div>
                      ) : (
                        <span className="text-text-soft">-</span>
                      )}
                    </Td>
                    <Td>
                      {row.status === "paid" ? (
                        <span className="text-xs text-text-soft">Received</span>
                      ) : isNext ? (
                        <div>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!payable}
                            onClick={() => openRecord(row)}
                          >
                            Record Payment
                          </Button>
                          {!payable && (
                            <p className="mt-1 text-xs text-text-soft">
                              Payable from {formatDate(row.pay_enabled_from)}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-text-soft">After earlier installments</span>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        </>
      )}

      <Modal
        open={!!milestone}
        onClose={closeRecord}
        title="Record payment"
        footer={
          <>
            <Button variant="outline" onClick={closeRecord} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={submitRecord} disabled={submitting || !canSubmit}>
              {submitting ? "Saving..." : "Confirm Received"}
            </Button>
          </>
        }
      >
        {milestone && (
          <div className="space-y-4">
            {formError && (
              <div className="rounded-xl border border-danger/30 bg-danger-bg p-3 text-sm text-danger">{formError}</div>
            )}
            <p>
              Record a payment received outside the online gateway for <strong>{milestone.label}</strong>. The
              customer will see this installment as paid.
            </p>
            <TextField label="Amount" value={formatCurrency(milestone.amount)} readOnly disabled />
            <div>
              <label htmlFor="installment-method" className="mb-1.5 block text-sm font-medium text-text">
                Payment method
              </label>
              <Select
                id="installment-method"
                className="w-full"
                value={method}
                onChange={(e) => {
                  setMethod(e.target.value as InstallmentPaymentMethod);
                  setReference("");
                }}
              >
                <option value="cash">{METHOD_LABEL.cash}</option>
                <option value="cheque">{METHOD_LABEL.cheque}</option>
                <option value="rtgs_neft">{METHOD_LABEL.rtgs_neft}</option>
              </Select>
            </div>
            {method === "cheque" && (
              <TextField label="Cheque number" value={reference} onChange={(e) => setReference(e.target.value)} />
            )}
            {method === "rtgs_neft" && (
              <TextField label="UTR number" value={reference} onChange={(e) => setReference(e.target.value)} />
            )}
            <textarea
              rows={2}
              maxLength={NOTE_MAX_LENGTH}
              className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-text focus:border-gold focus:outline-none"
              placeholder="Note for the record (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        )}
      </Modal>
    </Card>
  );
}
