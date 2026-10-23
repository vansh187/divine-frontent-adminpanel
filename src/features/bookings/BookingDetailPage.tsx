import { useCallback, useEffect, useRef, useState } from "react";
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
  downloadAllotmentLetter,
  downloadApplicationForm,
  downloadDemandLetter,
  getBooking,
  rejectBooking,
  uploadBookingDocument,
  type ApiBookingDetail,
  type BookingDocumentType,
} from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { saveBlob } from "../../lib/download";
import { formatCurrency, formatDateTime, titleCase } from "../../lib/format";
import { SectionErrorBoundary } from "../../components/SectionErrorBoundary";
import { PaymentPlanCard } from "./PaymentPlanCard";

type ModalKind = "approve" | "reject" | "cancelPlot" | null;

type BookingDocumentKind = "application" | "allotment" | "demand";

const REQUIRED_KYC_DOCUMENT_TYPES: BookingDocumentType[] = [
  "aadhaar_front",
  "aadhaar_back",
  "pan_card",
  "applicant_photo",
  "cancelled_cheque",
];

const KYC_DOCUMENT_LABELS: Record<BookingDocumentType, string> = {
  aadhaar_front: "Aadhaar Card - Front",
  aadhaar_back: "Aadhaar Card - Back",
  pan_card: "PAN Card",
  applicant_photo: "Applicant Photo",
  cancelled_cheque: "Cancelled Cheque",
};

const MAX_KYC_FILE_SIZE = 10 * 1024 * 1024;
const KYC_FILE_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};

function acceptedKycFileTypes(documentType: BookingDocumentType) {
  return documentType === "cancelled_cheque"
    ? ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
    : ".jpg,.jpeg,.png,image/jpeg,image/png";
}

function retryDelaySeconds(retryAfter: string | null) {
  if (!retryAfter) return 60;
  if (/^\d+(?:\.\d+)?$/.test(retryAfter)) return Math.max(1, Math.ceil(Number(retryAfter)));
  const retryAt = Date.parse(retryAfter);
  return Number.isFinite(retryAt) ? Math.max(1, Math.ceil((retryAt - Date.now()) / 1000)) : 60;
}

function validateKycFile(file: File, documentType: BookingDocumentType) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const expectedType = KYC_FILE_TYPES[extension];
  const pdfAllowed = documentType === "cancelled_cheque";
  if (!expectedType || (extension === "pdf" && !pdfAllowed) || file.type !== expectedType) {
    return pdfAllowed
      ? "Choose a PDF, JPG, JPEG, or PNG file."
      : "Choose a JPG, JPEG, or PNG image. PDF is only accepted for a cancelled cheque.";
  }
  if (file.size === 0) return "The selected file is empty.";
  if (file.size > MAX_KYC_FILE_SIZE) return "The file must be 10 MB or smaller.";
  return null;
}

function uploadErrorMessage(err: unknown) {
  if (err instanceof ApiError) {
    let message: string;
    if (err.status === 401) message = "Your session has expired. Please sign in again.";
    else if (err.status === 403) message = "Your admin account is not permitted to upload documents.";
    else if (err.status === 404) message = "This booking could not be found.";
    else if (err.status === 409 && err.code === "idempotency_conflict") message = "This upload key was already used for different content. Choose the file again and retry.";
    else if (err.status === 409 || err.code === "version_conflict" || err.code === "booking_not_uploadable") {
      message = err.message || "This booking changed or can no longer accept uploads. The latest details have been loaded; review them before retrying.";
    }
    else if (err.status === 413 || err.code === "file_too_large") message = "The file must be 10 MiB or smaller.";
    else if (err.status === 415 || err.code === "unsupported_media_type") message = err.message || "This file type is not allowed for the selected document.";
    else if (err.status === 429) {
      const retryAt = err.retryAfter
        ? /^\d+(?:\.\d+)?$/.test(err.retryAfter)
          ? Date.now() + Number(err.retryAfter) * 1000
          : Date.parse(err.retryAfter)
        : NaN;
      const waitSeconds = Number.isFinite(retryAt) ? Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)) : 60;
      message = `Too many upload attempts. Please try again in about ${waitSeconds} seconds.`;
    }
    else if (err.status >= 500) message = err.message || "The document service is temporarily unavailable. Please try again.";
    else message = err.message || "Could not upload this document. Please try again.";

    return err.requestId ? `${message} (Request ID: ${err.requestId})` : message;
  }
  if (err instanceof TypeError) return "Could not connect to the document service. Check your connection and try again.";
  return "Could not upload this document. Please try again.";
}

function createIdempotencyKey() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const BOOKING_DOCUMENTS: {
  kind: BookingDocumentKind;
  label: string;
  description: string;
  download: typeof downloadApplicationForm;
  filenamePrefix: string;
  /** Generated letters only exist once the plot is booked. */
  bookedOnly: boolean;
}[] = [
  {
    kind: "application",
    label: "Application Form",
    description: "The booking application form signed and uploaded by the customer.",
    download: downloadApplicationForm,
    filenamePrefix: "Booking-Application-Form",
    bookedOnly: false,
  },
  {
    kind: "allotment",
    label: "Allotment Letter",
    description: "Provisional allotment letter with the plot details and payment schedule.",
    download: downloadAllotmentLetter,
    filenamePrefix: "Allotment-Letter",
    bookedOnly: true,
  },
  {
    kind: "demand",
    label: "Demand Letter",
    description: "Installments due, amount received and outstanding balance.",
    download: downloadDemandLetter,
    filenamePrefix: "Demand-Letter",
    bookedOnly: true,
  },
];

function documentErrorMessage(err: unknown, doc: (typeof BOOKING_DOCUMENTS)[number]) {
  if (err instanceof TypeError) {
    return "Could not connect to the document service. Check your connection and try again.";
  }
  if (err instanceof ApiError && err.code === "not_uploaded") {
    return doc.kind === "application"
      ? "The customer has not uploaded the booking application form yet."
      : `The ${doc.label.toLowerCase()} is generated from the booking application form, which has not been uploaded for this booking yet.`;
  }
  if (err instanceof ApiError && err.code === "booking_not_booked") {
    return `The ${doc.label.toLowerCase()} is available once the booking is approved.`;
  }
  if (err instanceof ApiError && (err.status === 404 || err.code === "not_found")) {
    return doc.kind === "application"
      ? "The customer has not uploaded the booking application form yet."
      : `The ${doc.label.toLowerCase()} could not be found for this booking.`;
  }
  if (err instanceof ApiError && err.status === 403) return "You do not have permission to download this document.";
  if (err instanceof ApiError && err.message) return err.message;
  return `Could not download the ${doc.label.toLowerCase()}. Please try again.`;
}

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

  const [downloadingDocument, setDownloadingDocument] = useState<BookingDocumentKind | null>(null);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [selectedKycFiles, setSelectedKycFiles] = useState<Record<string, File | null>>({});
  const [kycNotes, setKycNotes] = useState<Record<string, string>>({});
  const [kycUploadErrors, setKycUploadErrors] = useState<Record<string, string>>({});
  const [uploadingKycType, setUploadingKycType] = useState<BookingDocumentType | null>(null);
  const [uploadRetryUntil, setUploadRetryUntil] = useState(0);
  const [uploadRetrySeconds, setUploadRetrySeconds] = useState(0);
  const uploadKeys = useRef<Record<string, string>>({});
  const kycFileInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const bookingRequestVersion = useRef(0);

  useEffect(() => {
    setDocumentError(null);
    setDownloadingDocument(null);
    setSelectedKycFiles({});
    setKycNotes({});
    setKycUploadErrors({});
    setUploadingKycType(null);
    uploadKeys.current = {};
  }, [id]);

  useEffect(() => {
    if (!uploadRetryUntil) {
      setUploadRetrySeconds(0);
      return;
    }
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((uploadRetryUntil - Date.now()) / 1000));
      setUploadRetrySeconds(remaining);
      if (remaining === 0) setUploadRetryUntil(0);
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [uploadRetryUntil]);

  const fetchBooking = useCallback(() => {
    if (!id || !accessToken) return;
    const requestVersion = ++bookingRequestVersion.current;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    getBooking(accessToken, id)
      .then((result) => {
        if (cancelled || requestVersion !== bookingRequestVersion.current) return;
        setBooking(result);
      })
      .catch((err) => {
        if (cancelled || requestVersion !== bookingRequestVersion.current) return;
        setLoadError(loadErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled && requestVersion === bookingRequestVersion.current) setLoading(false);
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
    setDocumentError(null);
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
      if (
        err instanceof ApiError &&
        (err.code === "version_conflict" ||
          err.code === "booking_not_reviewable" ||
          err.code === "booking_not_cancellable")
      ) {
        setActionError("This booking was already updated elsewhere — showing the latest state.");
        setModal(null);
        setNote("");
        fetchBooking();
      } else if (err instanceof ApiError && err.status === 404) {
        setActionError("This booking could not be found. It may have been removed.");
        setModal(null);
      } else if (err instanceof ApiError) {
        setActionError(err.message || "Something went wrong. Please try again.");
      } else {
        setActionError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDownloadDocument(doc: (typeof BOOKING_DOCUMENTS)[number]) {
    if (!accessToken || !booking) return;
    const requestedBookingId = booking.id;
    const requestVersion = bookingRequestVersion.current;
    setDownloadingDocument(doc.kind);
    setDocumentError(null);
    try {
      const { blob, filename } = await doc.download(accessToken, requestedBookingId);
      if (requestedBookingId !== id || requestedBookingId !== booking?.id || requestVersion !== bookingRequestVersion.current) return;
      saveBlob(blob, filename ?? `${doc.filenamePrefix}-${requestedBookingId}.pdf`);
    } catch (err) {
      if (requestedBookingId === id && requestedBookingId === booking?.id && requestVersion === bookingRequestVersion.current) {
        setDocumentError(documentErrorMessage(err, doc));
      }
    } finally {
      if (requestedBookingId === id && requestedBookingId === booking?.id && requestVersion === bookingRequestVersion.current) setDownloadingDocument(null);
    }
  }

  async function handleKycUpload(documentType: BookingDocumentType) {
    const file = selectedKycFiles[documentType];
    if (!accessToken || !booking || !file) return;
    const validationError = validateKycFile(file, documentType);
    if (validationError) {
      setKycUploadErrors((current) => ({ ...current, [documentType]: validationError }));
      return;
    }

    const bookingId = booking.id;
    const requestVersion = bookingRequestVersion.current;
    const idempotencyKey = uploadKeys.current[documentType] ?? createIdempotencyKey();
    uploadKeys.current[documentType] = idempotencyKey;
    setUploadingKycType(documentType);
    setKycUploadErrors((current) => ({ ...current, [documentType]: "" }));
    setActionError(null);
    setActionNotice(null);

    try {
      const updated = await uploadBookingDocument(
        accessToken,
        bookingId,
        documentType,
        file,
        booking.version,
        kycNotes[documentType] ?? "",
        idempotencyKey
      );
      if (bookingId !== id || requestVersion !== bookingRequestVersion.current) return;
      setBooking(updated);
      setSelectedKycFiles((current) => ({ ...current, [documentType]: null }));
      setKycNotes((current) => ({ ...current, [documentType]: "" }));
      setKycUploadErrors((current) => ({ ...current, [documentType]: "" }));
      delete uploadKeys.current[documentType];
      if (kycFileInputs.current[documentType]) kycFileInputs.current[documentType]!.value = "";
      setActionNotice(`${updated.documents.find((doc) => doc.document_type === documentType)?.label ?? "Document"} uploaded. Review it before approving KYC.`);
    } catch (err) {
      if (bookingId !== id || requestVersion !== bookingRequestVersion.current) return;
      if (err instanceof ApiError && err.code === "document_saved_refresh_failed") {
        const refreshVersion = ++bookingRequestVersion.current;
        setKycUploadErrors((current) => ({
          ...current,
          [documentType]: err.requestId
            ? `The document was saved. Refreshing booking details… (Request ID: ${err.requestId})`
            : "The document was saved. Refreshing booking details…",
        }));
        getBooking(accessToken, bookingId)
          .then((updated) => {
            if (bookingId !== id || refreshVersion !== bookingRequestVersion.current) return;
            setBooking(updated);
            setSelectedKycFiles((current) => ({ ...current, [documentType]: null }));
            setKycNotes((current) => ({ ...current, [documentType]: "" }));
            setKycUploadErrors((current) => ({ ...current, [documentType]: "" }));
            delete uploadKeys.current[documentType];
            if (kycFileInputs.current[documentType]) kycFileInputs.current[documentType]!.value = "";
            setActionNotice("Document saved. Review it before approving KYC.");
          })
          .catch((refreshError) => {
            if (bookingId !== id || refreshVersion !== bookingRequestVersion.current) return;
            const requestId = refreshError instanceof ApiError ? refreshError.requestId : null;
            setKycUploadErrors((current) => ({
              ...current,
              [documentType]: requestId
                ? `The document was saved, but booking details could not be refreshed. Retry this same upload or refresh the booking. (Request ID: ${requestId})`
                : "The document was saved, but booking details could not be refreshed. Retry this same upload or refresh the booking.",
            }));
          });
        return;
      }
      setKycUploadErrors((current) => ({ ...current, [documentType]: uploadErrorMessage(err) }));
      if (err instanceof ApiError && err.status === 409) {
        delete uploadKeys.current[documentType];
        fetchBooking();
      }
      if (err instanceof ApiError && err.status === 429) {
        setUploadRetryUntil(Date.now() + retryDelaySeconds(err.retryAfter) * 1000);
      }
    } finally {
      if (bookingId === id) setUploadingKycType(null);
    }
  }

  async function handleKycPreview(documentType: BookingDocumentType) {
    if (!accessToken || !booking) return;
    const bookingId = booking.id;
    const requestVersion = bookingRequestVersion.current;
    const previewWindow = window.open("about:blank", "_blank");
    if (!previewWindow) {
      setKycUploadErrors((current) => ({ ...current, [documentType]: "Allow pop-ups to open the secure document preview." }));
      return;
    }
    previewWindow.opener = null;
    setKycUploadErrors((current) => ({ ...current, [documentType]: "" }));
    try {
      const latest = await getBooking(accessToken, bookingId);
      if (bookingId !== id || requestVersion !== bookingRequestVersion.current) {
        previewWindow.close();
        return;
      }
      if (latest.version !== booking.version) uploadKeys.current = {};
      setBooking(latest);
      const previewUrl = latest.documents.find((doc) => doc.document_type === documentType)?.preview_url;
      if (!previewUrl) {
        previewWindow.close();
        setKycUploadErrors((current) => ({ ...current, [documentType]: "Preview is unavailable. Refresh the booking and try again." }));
        return;
      }
      previewWindow.location.replace(previewUrl);
    } catch (err) {
      previewWindow.close();
      if (bookingId !== id || requestVersion !== bookingRequestVersion.current) return;
      const requestId = err instanceof ApiError ? err.requestId : null;
      setKycUploadErrors((current) => ({
        ...current,
        [documentType]: requestId
          ? `Could not load the latest secure preview link. (Request ID: ${requestId})`
          : "Could not load the latest secure preview link. Please try again.",
      }));
    }
  }

  const isReviewable = booking?.status === "pending_kyc_review";
  const documentsByType = new Map((booking?.documents ?? []).map((doc) => [doc.document_type, doc]));
  const allDocumentsUploaded = REQUIRED_KYC_DOCUMENT_TYPES.every((type) => documentsByType.get(type)?.uploaded === true);
  const canApprove = isReviewable && allDocumentsUploaded;
  // Same truthiness check for label and value so an empty string never yields a blank reference.
  const paymentReference = booking?.utr_number
    ? { label: "UTR Number", value: booking.utr_number }
    : booking?.cheque_number
      ? { label: "Cheque Number", value: booking.cheque_number }
      : { label: "Reference", value: booking?.gateway_payment_id || booking?.razorpay_payment_id || "-" };
  const hasApplicationForm = (booking?.payment_schedule?.length ?? 0) > 0;
  const availableDocuments = BOOKING_DOCUMENTS.filter((doc) => !doc.bookedOnly || booking?.status === "booked");

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
                    <dt className="text-xs text-text-muted">{paymentReference.label}</dt>
                    <dd className="font-medium text-text">{paymentReference.value}</dd>
                  </div>
                </dl>
              </Card>

              {booking.status === "booked" && accessToken && (
                <SectionErrorBoundary title="Payment Plan" resetKey={booking}>
                  <PaymentPlanCard
                    accessToken={accessToken}
                    booking={booking}
                    onUpdated={(result) => {
                      setBooking(result);
                      setDocumentError(null);
                      setActionError(null);
                      setActionNotice(null);
                    }}
                    onStale={(message) => {
                      setActionNotice(null);
                      setActionError(message);
                      fetchBooking();
                    }}
                  />
                </SectionErrorBoundary>
              )}

              <SectionErrorBoundary title="KYC Document Checklist" resetKey={booking.id}>
                <Card className="p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-sm font-bold text-text">KYC Document Checklist</h3>
                    <StatusBadge status={booking.kyc_status.toUpperCase()} />
                  </div>
                  <p className="mb-4 text-xs text-text-muted">
                    Upload or replace a document on the customer&apos;s behalf. Aadhaar, PAN, and photo documents must be JPG, JPEG, or PNG images. PDF is accepted only for a cancelled cheque. Maximum size: 10 MiB.
                  </p>
                  <div className="space-y-3">
                    {REQUIRED_KYC_DOCUMENT_TYPES.map((documentType) => {
                      const doc = documentsByType.get(documentType);
                      const selectedFile = selectedKycFiles[documentType] ?? null;
                      const isUploading = uploadingKycType === documentType;
                      const error = kycUploadErrors[documentType];
                      return (
                        <div key={documentType} className="rounded-xl border border-border p-3">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-muted text-gold-dark">
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 3h8l4 4v14H7z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 3v4h4" />
                                </svg>
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-text">{doc?.label ?? KYC_DOCUMENT_LABELS[documentType]}</p>
                                <p className="text-xs text-text-muted">
                                  {doc?.uploaded ? `Uploaded ${formatDateTime(doc.uploaded_at)}` : "Not uploaded yet"}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <StatusBadge status="PENDING" label={doc?.uploaded ? "Uploaded" : "Missing"} />
                              {doc?.uploaded && doc.preview_url && (
                                <Button variant="outline" size="sm" onClick={() => void handleKycPreview(documentType)}>
                                  Preview securely
                                </Button>
                              )}
                              {doc?.uploaded && !doc.preview_url && (
                                <span className="text-xs text-text-muted">Preview unavailable; refresh booking</span>
                              )}
                              {isReviewable && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={uploadingKycType !== null || uploadRetrySeconds > 0}
                                  onClick={() => kycFileInputs.current[documentType]?.click()}
                                >
                                  {doc?.uploaded ? "Choose replacement" : "Choose file"}
                                </Button>
                              )}
                            </div>
                          </div>
                          <input
                            ref={(element) => { kycFileInputs.current[documentType] = element; }}
                            type="file"
                            accept={acceptedKycFileTypes(documentType)}
                            className="sr-only"
                            aria-label={`Choose ${doc?.label ?? KYC_DOCUMENT_LABELS[documentType]} file`}
                            disabled={!isReviewable || uploadingKycType !== null}
                            onChange={(event) => {
                              const file = event.currentTarget.files?.[0] ?? null;
                              setSelectedKycFiles((current) => ({ ...current, [documentType]: file }));
                              setKycUploadErrors((current) => ({ ...current, [documentType]: file ? validateKycFile(file, documentType) ?? "" : "" }));
                              delete uploadKeys.current[documentType];
                            }}
                          />
                          {selectedFile && (
                            <div className="mt-3 space-y-2 rounded-lg bg-surface-muted p-3">
                              <p className="break-all text-xs text-text-muted">Selected: {selectedFile.name}</p>
                              <label className="block text-xs font-medium text-text-muted" htmlFor={`kyc-note-${documentType}`}>
                                Upload note (optional)
                              </label>
                              <input
                                id={`kyc-note-${documentType}`}
                                type="text"
                                maxLength={500}
                                value={kycNotes[documentType] ?? ""}
                                onChange={(event) => {
                                  setKycNotes((current) => ({ ...current, [documentType]: event.target.value }));
                                  delete uploadKeys.current[documentType];
                                }}
                                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-gold focus:outline-none"
                                placeholder="For example: Replacement supplied after name mismatch"
                                disabled={isUploading}
                              />
                              <Button
                                size="sm"
                                disabled={isUploading || Boolean(error) || uploadRetrySeconds > 0}
                                onClick={() => void handleKycUpload(documentType)}
                              >
                                {isUploading
                                  ? "Uploading…"
                                  : uploadRetrySeconds > 0
                                    ? `Try again in ${uploadRetrySeconds}s`
                                    : `Upload ${doc?.uploaded ? "replacement" : "document"}`}
                              </Button>
                            </div>
                          )}
                          {error && <p role="alert" className="mt-2 text-xs text-danger">{error}</p>}
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-3 text-xs text-text-soft">
                    Uploading does not approve KYC. Review each document and approve the booking only after verification.
                  </p>
                </Card>
              </SectionErrorBoundary>
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

              <Card className="p-5">
                <h3 className="mb-1 text-sm font-bold text-text">Booking Documents</h3>
                <p className="mb-4 text-xs text-text-muted">
                  Unit {booking.unit_number}, {booking.project_name}
                </p>
                {documentError && (
                  <div className="mb-3 rounded-xl border border-danger/30 bg-danger-bg p-3 text-xs text-danger">
                    {documentError}
                  </div>
                )}
                <div className="space-y-3">
                  {availableDocuments.map((doc) => (
                    <div key={doc.kind} className="rounded-xl border border-border p-3">
                      <p className="text-sm font-semibold text-text">{doc.label}</p>
                      <p className="mb-2 text-xs text-text-muted">{doc.description}</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        disabled={downloadingDocument !== null || (doc.bookedOnly && !hasApplicationForm)}
                        onClick={() => handleDownloadDocument(doc)}
                      >
                        {downloadingDocument === doc.kind ? "Preparing..." : `Download ${doc.label}`}
                      </Button>
                    </div>
                  ))}
                </div>
                {booking.status === "pending_kyc_review" && (
                  <p className="mt-3 text-xs text-text-soft">
                    Allotment and demand letters become available once the booking is approved.
                  </p>
                )}
                {booking.status === "booked" && !hasApplicationForm && (
                  <p className="mt-3 text-xs text-text-soft">Upload the booking application form to enable the allotment and demand letters.</p>
                )}
              </Card>
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
