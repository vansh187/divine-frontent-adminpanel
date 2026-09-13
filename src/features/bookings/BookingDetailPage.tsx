import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { BackLink } from "../../components/ui/BackLink";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Modal } from "../../components/ui/Modal";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { formatCurrency } from "../../lib/format";
import { bookings } from "../../lib/mockData";

function plotStatusMessage(bookingStatus: string, plotStatus: string) {
  if (bookingStatus === "APPROVED" && plotStatus === "BOOKED") return "Fully Booked";
  return "KYC Verification Pending / Plot On Hold";
}

export function BookingDetailPage() {
  const { id } = useParams();
  const booking = useMemo(() => bookings.find((b) => b.id === id) ?? bookings[0], [id]);

  const [modal, setModal] = useState<"approve" | "reject" | "cancel" | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [cancelReason, setCancelReason] = useState("");

  const allDocsVerified = booking.documents.every((d) => d.status === "VERIFIED");
  const canApprove = allDocsVerified && booking.kycStatus === "VERIFIED" && booking.status !== "APPROVED";
  const canCancel = booking.status === "APPROVED" && booking.plotStatus === "BOOKED";

  return (
    <div>
      <BackLink to="/admin/bookings" label="Back to booking queue" />

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-bold text-text">{booking.id}</h1>
            <StatusBadge status={booking.status} />
          </div>
          <p className="mt-1 text-sm text-text-muted">
            {booking.customerName} · {booking.project} · Plot {booking.plot}
          </p>
          <p className="mt-1 text-xs font-medium text-gold-dark">{plotStatusMessage(booking.status, booking.plotStatus)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={!canCancel} onClick={() => setModal("cancel")}>
            Cancel Booking
          </Button>
          <Button variant="danger" size="sm" onClick={() => setModal("reject")}>
            Reject
          </Button>
          <Button size="sm" disabled={!canApprove} onClick={() => setModal("approve")}>
            Approve
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-5">
            <h3 className="mb-4 text-sm font-bold text-text">Booking &amp; Customer Details</h3>
            <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-text-muted">Customer</dt>
                <dd className="font-medium text-text">{booking.customerName}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted">Email</dt>
                <dd className="font-medium text-text">{booking.customerEmail}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted">Phone</dt>
                <dd className="font-medium text-text">{booking.customerPhone}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted">Project / Plot</dt>
                <dd className="font-medium text-text">
                  {booking.project} · {booking.plot}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted">Plot Status</dt>
                <dd><StatusBadge status={booking.plotStatus} /></dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted">Entity Version</dt>
                <dd className="font-medium text-text">v{booking.version}</dd>
              </div>
            </dl>
          </Card>

          <Card className="p-5">
            <h3 className="mb-4 text-sm font-bold text-text">Payment Details</h3>
            <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-text-muted">Amount</dt>
                <dd className="font-semibold text-text">{formatCurrency(booking.amount)}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted">Method</dt>
                <dd className="font-medium text-text">{booking.paymentMethod}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted">Payment Status</dt>
                <dd><StatusBadge status={booking.paymentStatus} /></dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted">Reference</dt>
                <dd className="font-medium text-text">{booking.paymentReference}</dd>
              </div>
            </dl>
          </Card>

          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-bold text-text">KYC Document Checklist</h3>
              <StatusBadge status={booking.kycStatus} />
            </div>
            <div className="space-y-3">
              {booking.documents.map((doc) => (
                <div key={doc.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-muted text-gold-dark">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7 3h8l4 4v14H7z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 3v4h4" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-text">{doc.name}</p>
                      <p className="text-xs text-text-muted">Uploaded {doc.uploadedAt}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={doc.status} />
                    <Button variant="outline" size="sm">
                      Preview
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-text-soft">
              Document preview requests a short-lived download URL and is never cached in browser storage.
            </p>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <h3 className="mb-4 text-sm font-bold text-text">Decision History</h3>
            <ol className="space-y-4">
              {booking.decisionHistory.map((item, i) => (
                <li key={i} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <span className="h-2.5 w-2.5 rounded-full bg-gold" />
                    {i < booking.decisionHistory.length - 1 && <span className="mt-1 h-full w-px flex-1 bg-border" />}
                  </div>
                  <div className="flex-1 pb-1">
                    <p className="text-sm font-semibold text-text">{item.action}</p>
                    <p className="text-xs text-text-muted">{item.actor}</p>
                    {item.note && <p className="mt-1 text-xs italic text-text-soft">&ldquo;{item.note}&rdquo;</p>}
                    <p className="mt-0.5 text-xs text-text-soft">{item.timestamp}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>

          {booking.status === "APPROVED" && (
            <Card className="p-5">
              <h3 className="mb-2 text-sm font-bold text-text">Receipt</h3>
              <p className="mb-3 text-xs text-text-muted">Final receipt is available for download.</p>
              <Button variant="outline" size="sm" className="w-full">
                Download Receipt PDF
              </Button>
            </Card>
          )}
        </div>
      </div>

      <Modal
        open={modal === "approve"}
        onClose={() => setModal(null)}
        title="Approve booking"
        footer={
          <>
            <Button variant="outline" onClick={() => setModal(null)}>
              Cancel
            </Button>
            <Button onClick={() => setModal(null)}>Confirm Approve</Button>
          </>
        }
      >
        <p>
          This will approve KYC and payment for <strong>{booking.id}</strong> and finalize plot{" "}
          <strong>{booking.plot}</strong> as BOOKED. This command is sent with the current entity
          version (v{booking.version}) and a unique idempotency key.
        </p>
      </Modal>

      <Modal
        open={modal === "reject"}
        onClose={() => setModal(null)}
        title="Reject booking"
        footer={
          <>
            <Button variant="outline" onClick={() => setModal(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => setModal(null)} disabled={!rejectReason.trim()}>
              Confirm Reject
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p>Provide a reason code and explanation. If the payment was captured online, a refund will be initiated.</p>
          <select className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-text focus:border-gold focus:outline-none">
            <option>KYC_MISMATCH</option>
            <option>DOCUMENT_INVALID</option>
            <option>DUPLICATE_BOOKING</option>
            <option>OTHER</option>
          </select>
          <textarea
            rows={3}
            className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-text focus:border-gold focus:outline-none"
            placeholder="Reason for rejection"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
        </div>
      </Modal>

      <Modal
        open={modal === "cancel"}
        onClose={() => setModal(null)}
        title="Cancel booking"
        footer={
          <>
            <Button variant="outline" onClick={() => setModal(null)}>
              Back
            </Button>
            <Button variant="danger" onClick={() => setModal(null)} disabled={!cancelReason.trim()}>
              Confirm Cancel
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p>Cancelling an approved booking releases the plot and may trigger a refund. This requires confirmation.</p>
          <textarea
            rows={3}
            className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-text focus:border-gold focus:outline-none"
            placeholder="Reason for cancellation"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
          />
          <input
            type="number"
            className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-text focus:border-gold focus:outline-none"
            placeholder="Refund amount (if editable)"
          />
        </div>
      </Modal>
    </div>
  );
}
