import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { BackLink } from "../../components/ui/BackLink";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Modal } from "../../components/ui/Modal";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { formatCurrency } from "../../lib/format";
import { bookings, settlements } from "../../lib/mockData";

const ELIGIBLE_ACTIONS: Record<string, string[]> = {
  PENDING: ["REVIEW", "HOLD", "REJECT"],
  UNDER_REVIEW: ["APPROVE", "HOLD", "REJECT"],
  APPROVED: ["MARK_PAID", "HOLD"],
  ON_HOLD: ["REVIEW", "REJECT"],
  REJECTED: [],
  PAID: [],
  REVERSED: [],
};

const ACTION_LABEL: Record<string, string> = {
  REVIEW: "Move to Review",
  APPROVE: "Approve",
  HOLD: "Hold",
  REJECT: "Reject",
  MARK_PAID: "Mark Paid",
};

export function SettlementDetailPage() {
  const { id } = useParams();
  const settlement = useMemo(() => settlements.find((s) => s.id === id) ?? settlements[0], [id]);
  const booking = bookings.find((b) => b.id === settlement.bookingId);
  const [modalAction, setModalAction] = useState<string | null>(null);
  const actions = ELIGIBLE_ACTIONS[settlement.status] ?? [];

  return (
    <div>
      <BackLink to="/admin/broker-settlements" label="Back to settlements" />

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-bold text-text">{settlement.id}</h1>
            <StatusBadge status={settlement.status} />
          </div>
          <p className="mt-1 text-sm text-text-muted">
            {settlement.brokerName} · {settlement.project} · Booking {settlement.bookingId}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {actions.length === 0 && (
            <span className="self-center text-xs text-text-soft">No further actions available</span>
          )}
          {actions.map((action) => (
            <Button
              key={action}
              size="sm"
              variant={action === "REJECT" ? "danger" : action === "MARK_PAID" ? "primary" : "outline"}
              onClick={() => setModalAction(action)}
            >
              {ACTION_LABEL[action]}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-5">
            <h3 className="mb-4 text-sm font-bold text-text">Deal Context</h3>
            <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-text-muted">Broker</dt>
                <dd className="font-medium text-text">{settlement.brokerName}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted">Booking</dt>
                <dd className="font-medium text-text">{settlement.bookingId}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted">Project</dt>
                <dd className="font-medium text-text">{settlement.project}</dd>
              </div>
              {booking && (
                <>
                  <div>
                    <dt className="text-xs text-text-muted">Customer</dt>
                    <dd className="font-medium text-text">{booking.customerName}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-text-muted">KYC Status</dt>
                    <dd><StatusBadge status={booking.kycStatus} /></dd>
                  </div>
                  <div>
                    <dt className="text-xs text-text-muted">Payment Status</dt>
                    <dd><StatusBadge status={booking.paymentStatus} /></dd>
                  </div>
                </>
              )}
              <div>
                <dt className="text-xs text-text-muted">Entity Version</dt>
                <dd className="font-medium text-text">v{settlement.version}</dd>
              </div>
            </dl>
          </Card>

          <Card className="p-5">
            <h3 className="mb-4 text-sm font-bold text-text">Commission</h3>
            <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-text-muted">Calculated Amount</dt>
                <dd className="font-semibold text-text">{formatCurrency(settlement.commissionAmount)}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted">Approved Amount</dt>
                <dd className="font-semibold text-text">
                  {settlement.approvedAmount ? formatCurrency(settlement.approvedAmount) : "—"}
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-text-soft">
              Commission value is calculated and returned by the backend. The UI never recomputes payout amounts.
            </p>
          </Card>

          <Card className="p-5">
            <h3 className="mb-4 text-sm font-bold text-text">Payout Trail</h3>
            <ol className="space-y-4">
              <li className="flex gap-4">
                <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-gold" />
                <div>
                  <p className="text-sm font-semibold text-text">Settlement created</p>
                  <p className="text-xs text-text-soft">{settlement.createdAt}</p>
                </div>
              </li>
              {settlement.status !== "PENDING" && (
                <li className="flex gap-4">
                  <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-gold" />
                  <div>
                    <p className="text-sm font-semibold text-text">Status updated to {settlement.status}</p>
                  </div>
                </li>
              )}
            </ol>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <h3 className="mb-4 text-sm font-bold text-text">Admin Remarks</h3>
            <p className="text-sm text-text-muted">
              Deal and payment verified against booking KYC checklist. Approved for payout subject
              to finance confirmation.
            </p>
          </Card>
        </div>
      </div>

      <Modal
        open={!!modalAction}
        onClose={() => setModalAction(null)}
        title={modalAction ? ACTION_LABEL[modalAction] : ""}
        footer={
          <>
            <Button variant="outline" onClick={() => setModalAction(null)}>
              Cancel
            </Button>
            <Button
              variant={modalAction === "REJECT" ? "danger" : "primary"}
              onClick={() => setModalAction(null)}
            >
              Confirm
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p>
            This action is sent with expected_version v{settlement.version} and a unique
            Idempotency-Key so retries never duplicate the payout event.
          </p>
          {modalAction === "MARK_PAID" && (
            <div className="space-y-3">
              <select className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-text focus:border-gold focus:outline-none">
                <option>BANK_TRANSFER</option>
                <option>CASH</option>
                <option>OTHER</option>
              </select>
              <input
                type="text"
                placeholder="Transaction reference (UTR)"
                className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-text focus:border-gold focus:outline-none"
              />
              <input
                type="date"
                className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-text focus:border-gold focus:outline-none"
              />
            </div>
          )}
          {(modalAction === "REJECT" || modalAction === "HOLD") && (
            <textarea
              rows={3}
              placeholder="Reason / remarks"
              className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-text focus:border-gold focus:outline-none"
            />
          )}
        </div>
      </Modal>
    </div>
  );
}
