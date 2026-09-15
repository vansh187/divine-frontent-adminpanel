import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { BackLink } from "../../components/ui/BackLink";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Modal } from "../../components/ui/Modal";
import { StatusBadge } from "../../components/ui/StatusBadge";
import {
  ApiError,
  approveBooking,
  cancelBookedPlot,
  getBooking,
  rejectBooking,
  type ApiBookingDetail,
} from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { formatCurrency, formatDateTime, titleCase } from "../../lib/format";

type ModalKind = "approve" | "reject" | "cancelPlot" | null;

function loadErrorMessage(err: unknown) {
  if (err instanceof ApiError) {
    if (err.status === 404) return "This booking could not be found.";
    return err.message;
  }
  return "Failed to load booking details.";
}

export function BookingDetailPage() {
  const { id } = useParams();
  const { accessToken } = useAuth();

  const [booking, setBooking] = useState<ApiBookingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [modal, setModal] = useState<ModalKind>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const fetchBooking = useCallback(() => {
    if (!id || !accessToken) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    getBooking(accessToken, id)
      .then((result) => {
        if (cancelled) return;
        setBooking(result);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(loadErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, id]);

  useEffect(() => {
    const cleanup = fetchBooking();
    return cleanup;
  }, [fetchBooking]);

  function openModal(kind: ModalKind) {
    setNote("");
    setActionError(null);
    setActionNotice(null);
    setModal(kind);
  }

  function closeModal() {
    if (submitting) return;
    setModal(null);
    setNote("");
    setActionError(null);
  }

  async function submitDecision(kind: "approve" | "reject" | "cancelPlot") {
    if (!accessToken || !booking) return;
    setSubmitting(true);
    setActionError(null);

    const action = kind === "approve" ? approveBooking : kind === "reject" ? rejectBooking : cancelBookedPlot;
    const payload = { note: note.trim() || undefined, version: booking.version };

    try {
      const result = await action(accessToken, booking.id, payload);
      setBooking(result);
      setModal(null);
      setNote("");
      setActionNotice(
        kind === "approve"
          ? "Booking approved. The plot is now booked and the customer's receipt has unlocked."
          : kind === "reject"
            ? "Booking rejected. The plot has been released and a refund was started."
            : "Plot booking cancelled. The plot has been released and a refund was started."
      );
    } catch (err) {
      if (err instanceof ApiError && (err.code === "version_conflict" || err.code === "booking_not_reviewable")) {
        setActionError("This booking was already updated elsewhere — showing the latest state.");
        setModal(null);
        setNote("");
        fetchBooking();
      } else if (err instanceof ApiError) {
        setActionError(err.message || "Something went wrong. Please try again.");
      } else {
        setActionError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const isReviewable = booking?.status === "pending_kyc_review";
  const allDocumentsUploaded = (booking?.documents ?? []).every((doc) => doc.uploaded);
  const canApprove = isReviewable && allDocumentsUploaded;

  return (
    <div>
      <BackLink to="/admin/bookings" label="Back to booking queue" />

      {loading && <Card className="p-10 text-center text-sm text-text-muted">Loading booking...</Card>}

      {!loading && loadError && (
        <Card className="p-10 text-center text-sm text-text-muted">
          <p className="mb-4">{loadError}</p>
          <Button variant="outline" size="sm" onClick={fetchBooking}>
            Try again
          </Button>
        </Card>
      )}

      {!loading && !loadError && booking && (
        <>
          {actionError && (
            <div className="mb-4 rounded-xl border border-danger/30 bg-danger-bg p-3 text-sm text-danger">
              {actionError}
            </div>
          )}
          {actionNotice && !actionError && (
            <div className="mb-4 rounded-xl border border-success/30 bg-success-bg p-3 text-sm text-success">
              {actionNotice}
            </div>
          )}

          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-xl font-bold text-text">{booking.id}</h1>
                <StatusBadge status={booking.status.toUpperCase()} />
              </div>
              <p className="mt-1 text-sm text-text-muted">
                {booking.customer_name} · {booking.project_name} · Unit {booking.unit_number}
              </p>
              {!isReviewable && (
                <p className="mt-1 text-xs font-medium text-gold-dark">
                  This booking has already been decided and can no longer be reviewed.
                </p>
              )}
              {isReviewable && !allDocumentsUploaded && (
                <p className="mt-1 text-xs font-medium text-gold-dark">
                  Approval is disabled until all KYC documents are uploaded.
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {booking.status === "booked" && (
                <Button variant="secondary" size="sm" onClick={() => openModal("cancelPlot")}>
                  Cancel Plot Booked
                </Button>
              )}
              <Button variant="danger" size="sm" disabled={!isReviewable} onClick={() => openModal("reject")}>
                Reject
              </Button>
              <Button size="sm" disabled={!canApprove} onClick={() => openModal("approve")}>
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
                    <dd className="font-medium text-text">{booking.customer_name}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-text-muted">Email</dt>
                    <dd className="font-medium text-text">{booking.customer_email ?? "-"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-text-muted">Phone</dt>
                    <dd className="font-medium text-text">{booking.customer_phone ?? "-"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-text-muted">Project / Unit</dt>
                    <dd className="font-medium text-text">
                      {booking.project_name} · {booking.unit_number}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-text-muted">KYC Status</dt>
                    <dd>
                      <StatusBadge status={booking.kyc_status.toUpperCase()} />
                    </dd>
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
                    <dd className="font-medium text-text">{titleCase(booking.payment_method ?? "-")}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-text-muted">Payment Status</dt>
                    <dd>
                      <StatusBadge status={(booking.payment_status ?? "-").toUpperCase()} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-text-muted">
                      {booking.utr_number ? "UTR Number" : "Reference"}
                    </dt>
                    <dd className="font-medium text-text">
                      {booking.utr_number ?? booking.razorpay_payment_id ?? "-"}
                    </dd>
                  </div>
                </dl>
              </Card>

              <Card className="p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-text">KYC Document Checklist</h3>
                  <StatusBadge status={booking.kyc_status.toUpperCase()} />
                </div>
                <div className="space-y-3">
                  {(booking.documents ?? []).map((doc) => (
                    <div
                      key={doc.document_type}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-muted text-gold-dark">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M7 3h8l4 4v14H7z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 3v4h4" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-text">{doc.label}</p>
                          <p className="text-xs text-text-muted">
                            {doc.uploaded ? `Uploaded ${formatDateTime(doc.uploaded_at)}` : "Not uploaded yet"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={doc.uploaded ? "VERIFIED" : "PENDING"} label={doc.uploaded ? "Uploaded" : "Missing"} />
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!doc.uploaded || !doc.preview_url}
                          onClick={() => {
                            if (doc.preview_url) window.open(doc.preview_url, "_blank", "noopener,noreferrer");
                          }}
                        >
                          Preview
                        </Button>
                      </div>
                    </div>
                  ))}
                  {(booking.documents ?? []).length === 0 && (
                    <p className="text-sm text-text-muted">No documents on file yet.</p>
                  )}
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
                  {(booking.decision_history ?? []).map((item, i, arr) => (
                    <li key={i} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <span className="h-2.5 w-2.5 rounded-full bg-gold" />
                        {i < arr.length - 1 && <span className="mt-1 h-full w-px flex-1 bg-border" />}
                      </div>
                      <div className="flex-1 pb-1">
                        <p className="text-sm font-semibold text-text">{titleCase(item.action)}</p>
                        <p className="text-xs text-text-muted">{titleCase(item.actor)}</p>
                        {item.note && <p className="mt-1 text-xs italic text-text-soft">&ldquo;{item.note}&rdquo;</p>}
                        <p className="mt-0.5 text-xs text-text-soft">{formatDateTime(item.created_at)}</p>
                      </div>
                    </li>
                  ))}
                  {(booking.decision_history ?? []).length === 0 && (
                    <p className="text-sm text-text-muted">No activity yet.</p>
                  )}
                </ol>
              </Card>

              {booking.status === "booked" && (
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
        </>
      )}

      <Modal
        open={modal === "approve"}
        onClose={closeModal}
        title="Approve booking"
        footer={
          <>
            <Button variant="outline" onClick={closeModal} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={() => submitDecision("approve")} disabled={submitting}>
              {submitting ? "Approving..." : "Confirm Approve"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {actionError && modal === "approve" && (
            <div className="rounded-xl border border-danger/30 bg-danger-bg p-3 text-sm text-danger">{actionError}</div>
          )}
          <p>
            This will confirm KYC and finalize the plot as booked for <strong>{booking?.id}</strong>. The
            customer will be emailed a confirmation with your note.
          </p>
          <textarea
            rows={3}
            className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-text focus:border-gold focus:outline-none"
            placeholder="Note for the customer (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </Modal>

      <Modal
        open={modal === "reject"}
        onClose={closeModal}
        title="Reject booking"
        footer={
          <>
            <Button variant="outline" onClick={closeModal} disabled={submitting}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => submitDecision("reject")}
              disabled={submitting || !note.trim()}
            >
              {submitting ? "Rejecting..." : "Confirm Reject"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {actionError && modal === "reject" && (
            <div className="rounded-xl border border-danger/30 bg-danger-bg p-3 text-sm text-danger">{actionError}</div>
          )}
          <p>
            This releases the plot back to available and starts a refund. Provide a reason — it will be
            emailed to the customer.
          </p>
          <textarea
            rows={3}
            className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-text focus:border-gold focus:outline-none"
            placeholder="Reason for rejection"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </Modal>

      <Modal
        open={modal === "cancelPlot"}
        onClose={closeModal}
        title="Cancel plot booked"
        footer={
          <>
            <Button variant="outline" onClick={closeModal} disabled={submitting}>
              Back
            </Button>
            <Button
              variant="danger"
              onClick={() => submitDecision("cancelPlot")}
              disabled={submitting}
            >
              {submitting ? "Cancelling..." : "Confirm Cancel"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {actionError && modal === "cancelPlot" && (
            <div className="rounded-xl border border-danger/30 bg-danger-bg p-3 text-sm text-danger">{actionError}</div>
          )}
          <p>
            This cancels an already-booked plot for <strong>{booking?.id}</strong>, releasing it back to
            available and starting a refund.
          </p>
          <textarea
            rows={3}
            className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-text focus:border-gold focus:outline-none"
            placeholder="Note for the record (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </Modal>
    </div>
  );
}
