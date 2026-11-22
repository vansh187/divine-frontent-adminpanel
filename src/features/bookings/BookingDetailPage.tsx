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
  verifyBookingKyc,
  type ApiBookingDetail,
  type BookingDocumentType,
} from "../../lib/api";
import { bookingApplicant, otherAccountHolder } from "../../lib/applicants";
import { useAuth } from "../../lib/auth";
import { createIdempotencyKey } from "../../lib/idempotency";
import { saveBlob } from "../../lib/download";
import { formatCurrency, formatDateTime, titleCase } from "../../lib/format";
import { paymentMethodLabel } from "../../lib/paymentMethods";
import { SectionErrorBoundary } from "../../components/SectionErrorBoundary";
import { DocumentPreviewModal, type DocumentPreview } from "../../components/DocumentPreviewModal";
import { PaymentPlanCard } from "./PaymentPlanCard";

type DecisionKind = "approve" | "reject" | "cancelPlot" | "verifyKyc";
type ModalKind = DecisionKind | null;

const DECISIONS: Record<DecisionKind, { action: typeof approveBooking; done: string }> = {
  approve: {
    action: approveBooking,
    done: "Booking approved. The plot is now booked and the customer's receipt has unlocked.",
  },
  reject: { action: rejectBooking, done: "Booking rejected. The plot has been released and a refund was started." },
  cancelPlot: {
    action: cancelBookedPlot,
    done: "Plot booking cancelled. The plot has been released and a refund was started.",
  },
  verifyKyc: { action: verifyBookingKyc, done: "KYC verified." },
};

/** History entries titleCase would misspell. */
const HISTORY_LABELS: Record<string, string> = {
  kyc_document_uploaded: "KYC Document Uploaded",
  kyc_verified: "KYC Verified",
  kyc_reopened: "KYC Back to Pending",
};

const NOTE_MAX_LENGTH = 2000;

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
  if (file.size > MAX_KYC_FILE_SIZE) return "Maximum size is 10 MiB.";
  return null;
}

function uploadErrorMessage(err: unknown) {
  if (err instanceof ApiError) {
    let message: string;
    if (err.status === 401) message = "Your session has expired. Please sign in again.";
    else if (err.status === 403) message = "Your admin account is not approved, so it can't upload documents.";
    else if (err.status === 404) message = "This booking no longer exists.";
    else if (err.code === "idempotency_conflict") message = "This upload could not be repeated as it was. Press Upload to send it again.";
    else if (err.code === "booking_not_uploadable") message = "This booking no longer accepts document uploads.";
    else if (err.code === "version_conflict") {
      message = "This booking changed since it was loaded, so nothing was uploaded. The latest details are now shown and your file is kept: check them, then press Upload again.";
    }
    else if (err.status === 409) message = err.message || "This booking changed. Check the latest details, then try again.";
    else if (err.status === 413) message = "Maximum size is 10 MiB.";
    else if (err.status === 415) message = err.message || "This file type is not allowed for the selected document.";
    else if (err.status === 429) message = `Too many upload attempts. Please try again in about ${retryDelaySeconds(err.retryAfter)} seconds.`;
    else if (err.code === "document_storage_unavailable") message = "The document service is temporarily unavailable. Please try again.";
    else if (err.status >= 500) message = `Unable to upload this document. Please try again${err.requestId ? ", or contact support with the request ID" : ""}.`;
    else message = err.message || "Could not upload this document. Please try again.";

    return err.requestId ? `${message} (Request ID: ${err.requestId})` : message;
  }
  if (err instanceof TypeError) return "Could not connect to the document service. Check your connection and try again.";
  return "Could not upload this document. Please try again.";
}

const BOOKING_DOCUMENTS: {
  kind: BookingDocumentKind;
  label: string;
  description: string;
  download: typeof downloadApplicationForm;
  filenamePrefix: string;
  /** Generated letters only exist once the plot is booked. */
  bookedOnly: boolean;
  /** The admin can read it in the panel before downloading it. */
  viewable: boolean;
}[] = [
  {
    kind: "application",
    label: "Application Form",
    description: "The booking application form signed and uploaded by the customer.",
    download: downloadApplicationForm,
    filenamePrefix: "Booking-Application-Form",
    bookedOnly: false,
    viewable: false,
  },
  {
    kind: "allotment",
    label: "Allotment Letter",
    description: "Provisional allotment letter with the plot details and payment schedule.",
    download: downloadAllotmentLetter,
    filenamePrefix: "Allotment-Letter",
    bookedOnly: true,
    viewable: false,
  },
  {
    kind: "demand",
    label: "Demand Letter",
    description: "Installments due, amount received and outstanding balance.",
    download: downloadDemandLetter,
    filenamePrefix: "Demand-Letter",
    bookedOnly: true,
    viewable: true,
  },
];

function documentErrorMessage(err: unknown, doc: (typeof BOOKING_DOCUMENTS)[number], action: "download" | "open" = "download") {
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
  if (err instanceof ApiError && err.status === 403) return `You do not have permission to ${action} this document.`;
  if (err instanceof ApiError && err.message) return err.message;
  return `Could not ${action} the ${doc.label.toLowerCase()}. Please try again.`;
}

/** The server decides: an existing customer's booking accepts documents although it is already booked. */
function acceptsUploads(booking: ApiBookingDetail) {
  // Older backends don't say: only a booking under review accepts them there.
  return booking.can_upload_documents ?? booking.status === "pending_kyc_review";
}

function loadErrorMessage(err: unknown) {
  if (err instanceof ApiError) {
    if (err.status === 404) return "This booking could not be found.";
    return err.message;
  }
  return "Failed to load booking details.";
}

const CHANGED_WARNING =
  "This booking has changed since it was loaded. Check its details and documents again before making a decision.";
const RELOAD_FAILED_WARNING = "The latest details of this booking could not be loaded. Refresh the page.";

export function BookingDetailPage() {
  const { id = "" } = useParams();
  // One component per booking: nothing typed, chosen or opened for one can act on another.
  return <BookingDetail key={id} id={id} />;
}

function BookingDetail({ id }: { id: string }) {
  const { accessToken } = useAuth();

  const [booking, setBooking] = useState<ApiBookingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [modal, setModal] = useState<ModalKind>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  /** What is on screen changed without the admin doing it, or may be out of date. */
  const [warning, setWarning] = useState<string | null>(null);

  const [downloadingDocument, setDownloadingDocument] = useState<BookingDocumentKind | null>(null);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [preview, setPreview] = useState<DocumentPreview | null>(null);
  const [selectedKycFiles, setSelectedKycFiles] = useState<Record<string, File | null>>({});
  const [kycNotes, setKycNotes] = useState<Record<string, string>>({});
  const [kycUploadErrors, setKycUploadErrors] = useState<Record<string, string>>({});
  const [uploadingKycType, setUploadingKycType] = useState<BookingDocumentType | null>(null);
  const [uploadRetryUntil, setUploadRetryUntil] = useState(0);
  const [uploadRetrySeconds, setUploadRetrySeconds] = useState(0);
  // A retry of the same upload reuses its key; a different file, note or booking version is a new upload.
  const uploadKeys = useRef<Record<string, { key: string; version: number }>>({});
  const kycFileInputs = useRef<Record<string, HTMLInputElement | null>>({});
  // False once the admin has left this booking: what still arrives for it is dropped.
  const mounted = useRef(true);
  const shown = useRef<ApiBookingDetail | null>(null);
  // Orders responses by when they describe the booking: a load when it was asked for (the
  // server may have read it right away), a saved change when its reply arrived.
  const clock = useRef(0);
  const shownAt = useRef(0);
  const latestLoad = useRef(0);
  // The version a decision is made on: the one on screen when its dialog opened.
  const decisionVersion = useRef(0);
  const submittingDecision = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

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

  const display = useCallback((latest: ApiBookingDetail, at: number) => {
    shown.current = latest;
    shownAt.current = at;
    setBooking(latest);
    setLoading(false);
    setLoadError(null);
    // These are the latest details; a change the admin must look into stays until they act on it.
    setWarning((current) => (current === RELOAD_FAILED_WARNING ? null : current));
  }, []);

  /** The booking is no longer the one the admin has been looking at: say so, and drop a decision about it. */
  const warnChanged = useCallback(() => {
    setWarning(CHANGED_WARNING);
    if (submittingDecision.current) return; // Already sent: the server checks its version.
    setModal(null);
    setNote("");
  }, []);

  /** Shows a load asked for at `at`, unless something newer is on screen. `explained`: its caller says what changed. */
  const showLoaded = useCallback(
    (latest: ApiBookingDetail, at: number, explained = false) => {
      const before = shown.current;
      if (!mounted.current || at < shownAt.current || (before && latest.version < before.version)) return;
      display(latest, at);
      if (before && latest.version !== before.version && !explained) warnChanged();
    },
    [display, warnChanged]
  );

  /** Reloads in place: the page, its scroll position and the chosen files stay. Throws if it can't. */
  const refreshInPlace = useCallback(
    async (token: string, explained = false): Promise<ApiBookingDetail> => {
      const at = ++clock.current;
      const latest = await getBooking(token, id);
      showLoaded(latest, at, explained);
      return shown.current ?? latest;
    },
    [id, showLoaded]
  );

  /**
   * Shows the booking a saved change returned. `before`: the booking on screen when it was sent.
   * `bumps`: the change itself moves the version on by one; any further and someone else changed it too.
   */
  function showSaved(result: ApiBookingDetail, before: ApiBookingDetail, bumps: 0 | 1) {
    if (!mounted.current) return;
    const current = shown.current;
    const overlapped = current !== before;
    const expected = Math.max(before.version + bumps, current?.version ?? 0);
    if (!current || result.version >= current.version) {
      display(result, ++clock.current);
      if (result.version > expected) warnChanged();
    }
    // Two changes crossed: neither reply is sure to hold both.
    if (overlapped && accessToken)
      refreshInPlace(accessToken).catch(() => {
        if (mounted.current) setWarning(RELOAD_FAILED_WARNING);
      });
  }

  /** Loads the whole page. `explained`: the caller says why, so a changed booking needs no warning. */
  const fetchBooking = useCallback(
    (explained = false) => {
      if (!id || !accessToken) return;
      const at = ++clock.current;
      latestLoad.current = at;
      let cancelled = false;
      setLoading(true);
      setLoadError(null);

      getBooking(accessToken, id)
        .then((result) => {
          if (!cancelled) showLoaded(result, at, explained);
        })
        .catch((err) => {
          // A saved change arrived meanwhile: its booking stays on screen.
          if (!cancelled && mounted.current && at > shownAt.current) setLoadError(loadErrorMessage(err));
        })
        .finally(() => {
          if (!cancelled && mounted.current && latestLoad.current === at) setLoading(false);
        });

      return () => {
        cancelled = true;
      };
    },
    [accessToken, id, showLoaded]
  );

  useEffect(() => {
    const cleanup = fetchBooking();
    return cleanup;
  }, [fetchBooking]);

  function openModal(kind: ModalKind) {
    decisionVersion.current = booking?.version ?? 0;
    setNote("");
    setActionError(null);
    setActionNotice(null);
    setWarning(null);
    setModal(kind);
  }

  function closeModal() {
    if (submitting) return;
    setModal(null);
    setNote("");
    setActionError(null);
  }

  /** KYC verification was refused because the booking moved on: says why, going by its latest details. */
  async function explainRefusedVerification(token: string, err: ApiError) {
    const conflict = err.code === "version_conflict";
    const refusal = err.message || "KYC could not be verified.";
    let error: string | null;
    try {
      const latest = await refreshInPlace(token, true);
      if (latest.kyc_status === "verified") error = null; // Also an earlier try of ours whose reply was lost.
      else
        error = conflict
          ? "This booking or one of its documents changed since it was loaded, so KYC was not verified. The latest details are now shown: check the documents again."
          : refusal;
    } catch {
      error = conflict
        ? "This booking changed since it was loaded, and its latest details could not be loaded. Refresh the page to see whether KYC is verified."
        : `${refusal} The latest details could not be loaded: refresh the page.`;
    }
    if (!mounted.current) return;
    setModal(null);
    setNote("");
    setActionError(error);
    if (!error) setActionNotice("KYC is already verified.");
  }

  async function submitDecision(kind: DecisionKind) {
    if (!accessToken || !booking || submittingDecision.current) return;
    submittingDecision.current = true;
    setSubmitting(true);
    setDocumentError(null);
    setActionError(null);

    const payload = { note: note.trim() || undefined, version: decisionVersion.current };

    try {
      const result = await DECISIONS[kind].action(accessToken, booking.id, payload);
      if (!mounted.current) return;
      showSaved(result, booking, 1);
      setModal(null);
      setNote("");
      if (kind === "verifyKyc" && result.kyc_status !== "verified") setWarning(CHANGED_WARNING);
      else setActionNotice(DECISIONS[kind].done);
    } catch (err) {
      if (!mounted.current) return;
      if (kind === "verifyKyc" && err instanceof ApiError && err.status === 409) {
        await explainRefusedVerification(accessToken, err);
      } else if (kind === "verifyKyc" && err instanceof ApiError && err.status === 403) {
        setActionError("Your admin account is not approved, so it can't verify KYC.");
      } else if (
        err instanceof ApiError &&
        (err.code === "version_conflict" ||
          err.code === "booking_not_reviewable" ||
          err.code === "booking_not_cancellable")
      ) {
        setActionError("This booking was already updated elsewhere — showing the latest state.");
        setModal(null);
        setNote("");
        fetchBooking(true);
      } else if (err instanceof ApiError && err.code === "offline_booking_not_cancellable") {
        setActionError("This plot was sold offline, so it can't be cancelled or refunded here.");
      } else if (err instanceof ApiError && err.status === 404) {
        setActionError("This booking could not be found. It may have been removed.");
        setModal(null);
      } else if (err instanceof ApiError && err.status < 500) {
        setActionError(err.message || "Something went wrong. Please try again.");
      } else {
        setActionError("Something went wrong. Please try again.");
      }
    } finally {
      submittingDecision.current = false;
      setSubmitting(false);
    }
  }

  async function handleDownloadDocument(doc: (typeof BOOKING_DOCUMENTS)[number]) {
    if (!accessToken || !booking) return;
    setDownloadingDocument(doc.kind);
    setDocumentError(null);
    try {
      const { blob, filename } = await doc.download(accessToken, booking.id);
      if (mounted.current) saveBlob(blob, filename ?? `${doc.filenamePrefix}-${booking.id}.pdf`);
    } catch (err) {
      setDocumentError(documentErrorMessage(err, doc));
    } finally {
      setDownloadingDocument(null);
    }
  }

  async function handleViewDocument(doc: (typeof BOOKING_DOCUMENTS)[number]) {
    if (!accessToken || !booking) return;
    const title = doc.label;
    const fallbackName = `${doc.filenamePrefix}-${booking.id}.pdf`;
    setDocumentError(null);
    setPreview({ title, blob: null, filename: fallbackName, error: null });
    // Only fills a preview still waiting for this document: the admin may have closed or reopened it.
    const fill = (filled: Partial<DocumentPreview>) =>
      setPreview((p) => (p?.title === title && !p.blob ? { ...p, ...filled } : p));
    try {
      const { blob, filename } = await doc.download(accessToken, booking.id);
      fill({ blob, filename: filename ?? fallbackName, error: null });
    } catch (err) {
      fill({ error: documentErrorMessage(err, doc, "open") });
    }
  }

  /** After a document is stored: clears what was chosen for it and says so. */
  function finishKycUpload(documentType: BookingDocumentType, updated: ApiBookingDetail, wasVerified: boolean) {
    setSelectedKycFiles((current) => ({ ...current, [documentType]: null }));
    setKycNotes((current) => ({ ...current, [documentType]: "" }));
    setKycUploadErrors((current) => ({ ...current, [documentType]: "" }));
    delete uploadKeys.current[documentType];
    if (kycFileInputs.current[documentType]) kycFileInputs.current[documentType]!.value = "";
    const label = updated.documents.find((doc) => doc.document_type === documentType)?.label ?? "Document";
    const reopened = wasVerified && updated.kyc_status !== "verified";
    setActionNotice(
      `${label} uploaded.${reopened ? " KYC is back to Pending until it is verified again." : updated.is_offline ? "" : " Review it before approving KYC."}`
    );
  }

  async function handleKycUpload(documentType: BookingDocumentType) {
    const file = selectedKycFiles[documentType];
    if (!accessToken || !booking || !file || uploadingKycType !== null) return;
    if (validateKycFile(file, documentType) !== null) return;

    const showError = (message: string) => setKycUploadErrors((current) => ({ ...current, [documentType]: message }));
    const { version } = booking;
    const wasVerified = booking.kyc_status === "verified";
    const previous = uploadKeys.current[documentType];
    const idempotencyKey = previous?.version === version ? previous.key : createIdempotencyKey();
    uploadKeys.current[documentType] = { key: idempotencyKey, version };
    setUploadingKycType(documentType);
    showError("");
    setActionError(null);
    setActionNotice(null);

    try {
      const updated = await uploadBookingDocument(
        accessToken,
        booking.id,
        documentType,
        file,
        version,
        kycNotes[documentType] ?? "",
        idempotencyKey
      );
      if (!mounted.current) return;
      showSaved(updated, booking, 1);
      finishKycUpload(documentType, updated, wasVerified);
    } catch (err) {
      if (!mounted.current) return;
      if (err instanceof ApiError && err.code === "document_saved_refresh_failed") {
        const reference = err.requestId ? ` (Request ID: ${err.requestId})` : "";
        showError(`The document was saved. Refreshing booking details…${reference}`);
        try {
          const updated = await refreshInPlace(accessToken, true);
          if (!mounted.current) return;
          finishKycUpload(documentType, updated, wasVerified);
          if (updated.version > version + 1) warnChanged();
        } catch {
          // Pressing Upload again is safe: the same key replays the saved upload.
          showError(`The document was saved, but the booking could not be reloaded. Refresh the page to see it.${reference}`);
        }
        return;
      }
      showError(uploadErrorMessage(err));
      if (!(err instanceof ApiError)) return;
      if (err.status === 429) setUploadRetryUntil(Date.now() + retryDelaySeconds(err.retryAfter) * 1000);
      if (err.status === 409) {
        delete uploadKeys.current[documentType];
        if (err.code === "booking_not_uploadable") {
          // Hide the controls now, even if the reload below fails.
          if (shown.current) display({ ...shown.current, can_upload_documents: false }, shownAt.current);
          setSelectedKycFiles({});
        }
        try {
          // A version conflict says what happened; for the others a changed booking is news.
          const latest = await refreshInPlace(accessToken, err.code === "version_conflict");
          if (!acceptsUploads(latest)) showError("This booking no longer accepts document uploads.");
        } catch {
          if (err.code === "version_conflict")
            showError("This booking changed since it was loaded, so nothing was uploaded, and its latest details could not be loaded. Refresh the page before trying again.");
        }
      }
    } finally {
      setUploadingKycType(null);
    }
  }

  async function handleKycPreview(documentType: BookingDocumentType) {
    if (!accessToken || !booking) return;
    const previewWindow = window.open("about:blank", "_blank");
    if (!previewWindow) {
      setKycUploadErrors((current) => ({ ...current, [documentType]: "Allow pop-ups to open the secure document preview." }));
      return;
    }
    previewWindow.opener = null;
    setKycUploadErrors((current) => ({ ...current, [documentType]: "" }));
    try {
      const latest = await refreshInPlace(accessToken);
      if (!mounted.current) {
        previewWindow.close();
        return;
      }
      const previewUrl = latest.documents.find((doc) => doc.document_type === documentType)?.preview_url;
      if (!previewUrl) {
        previewWindow.close();
        setKycUploadErrors((current) => ({ ...current, [documentType]: "Preview is unavailable. Refresh the booking and try again." }));
        return;
      }
      previewWindow.location.replace(previewUrl);
    } catch (err) {
      previewWindow.close();
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
  const canUpload = !!booking && acceptsUploads(booking);
  // An existing customer's plot is booked already: their KYC is verified, not the booking approved.
  const verifiesKyc = !!booking?.is_offline && booking.status === "booked" && booking.can_verify_kyc !== undefined;
  const kycVerified = booking?.kyc_status === "verified";
  // Only a backend that verifies KYC here also puts it back to pending when a document is replaced.
  const replacingReopensKyc = verifiesKyc && kycVerified;
  const existingCustomerText = kycVerified
    ? "Existing customer. KYC is verified."
    : verifiesKyc && booking?.can_verify_kyc
      ? "Existing customer. All KYC documents are uploaded: review each one, then verify KYC."
      : allDocumentsUploaded
        ? "Existing customer. All KYC documents are uploaded."
        : canUpload
          ? "Existing customer. Upload their KYC documents below."
          : null;
  // An existing customer's plot was never up for review here, so nothing about it was "decided".
  const headerText = isReviewable
    ? allDocumentsUploaded
      ? null
      : "Approval is disabled until all KYC documents are uploaded."
    : booking?.is_offline && booking.status === "booked"
      ? existingCustomerText
      : "This booking has already been decided and can no longer be reviewed.";
  const accountHolder = booking ? otherAccountHolder(booking) : null;
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
          <Button variant="outline" size="sm" onClick={() => fetchBooking()}>
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
          {warning && (
            <div role="status" className="mb-4 rounded-xl border border-warning/30 bg-warning-bg p-3 text-sm text-warning">
              {warning}
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
                {bookingApplicant(booking)} · {booking.project_name} · Unit {booking.unit_number}
              </p>
              {headerText && <p className="mt-1 text-xs font-medium text-gold-dark">{headerText}</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              {booking.status === "booked" && !booking.is_offline && (
                <Button variant="secondary" size="sm" onClick={() => openModal("cancelPlot")}>
                  Cancel Plot Booked
                </Button>
              )}
              {verifiesKyc ? (
                !kycVerified && (
                  <Button
                    size="sm"
                    // A document being uploaded is one nobody has checked yet.
                    disabled={!booking.can_verify_kyc || uploadingKycType !== null}
                    title={allDocumentsUploaded ? undefined : "Upload all 5 KYC documents first"}
                    onClick={() => openModal("verifyKyc")}
                  >
                    Verify KYC
                  </Button>
                )
              ) : (
                <>
                  <Button variant="danger" size="sm" disabled={!isReviewable} onClick={() => openModal("reject")}>
                    Reject
                  </Button>
                  <Button size="sm" disabled={!canApprove} onClick={() => openModal("approve")}>
                    Approve
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <Card className="p-5">
                <h3 className="mb-4 text-sm font-bold text-text">Booking &amp; Customer Details</h3>
                <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-xs text-text-muted">Customer</dt>
                    <dd className="font-medium text-text">{bookingApplicant(booking)}</dd>
                    {booking.is_offline && <dd className="text-xs text-text-muted">Offline buyer</dd>}
                  </div>
                  {accountHolder && (
                    <div>
                      <dt className="text-xs text-text-muted">Account Holder</dt>
                      <dd className="font-medium text-text">{accountHolder}</dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-xs text-text-muted">{accountHolder ? "Account Holder's Email" : "Email"}</dt>
                    <dd className="font-medium text-text">{booking.customer_email ?? "-"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-text-muted">{accountHolder ? "Account Holder's Phone" : "Phone"}</dt>
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
                    <dd className="font-semibold text-text">{booking.amount == null ? "-" : formatCurrency(booking.amount)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-text-muted">Method</dt>
                    <dd className="font-medium text-text">{paymentMethodLabel(booking.payment_method) || "-"}</dd>
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
                      setDocumentError(null);
                      setActionError(null);
                      setActionNotice(null);
                      // Recording a payment doesn't move the booking's version on.
                      showSaved(result, booking, 0);
                    }}
                    onStale={(message) => {
                      setActionNotice(null);
                      setActionError(message);
                      // The message is about the instalment: a changed booking is still news.
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
                    {canUpload
                      ? "Upload or replace a document on the customer's behalf. Aadhaar, PAN, and photo documents must be JPG, JPEG, or PNG images. PDF is accepted only for a cancelled cheque. Maximum size: 10 MiB."
                      : "This booking's documents can be viewed but no longer changed."}
                  </p>
                  <div className="space-y-3">
                    {REQUIRED_KYC_DOCUMENT_TYPES.map((documentType) => {
                      const doc = documentsByType.get(documentType);
                      const selectedFile = selectedKycFiles[documentType] ?? null;
                      const isUploading = uploadingKycType === documentType;
                      // Why this file can't be sent stays on screen, whatever else is reported for the document.
                      const fileProblem = canUpload && selectedFile ? validateKycFile(selectedFile, documentType) : null;
                      const errors = [fileProblem, kycUploadErrors[documentType]].filter(Boolean);
                      const label = doc?.label ?? KYC_DOCUMENT_LABELS[documentType];
                      const uploadsBlocked = uploadingKycType !== null || uploadRetrySeconds > 0;
                      const chooseText = doc?.uploaded ? "Choose replacement" : "Choose file";
                      const uploadText = `Upload ${doc?.uploaded ? "replacement" : "document"}`;
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
                                <p className="text-sm font-semibold text-text">{label}</p>
                                <p className="text-xs text-text-muted">
                                  {doc?.uploaded ? `Uploaded ${formatDateTime(doc.uploaded_at)}` : "Not uploaded yet"}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <StatusBadge status="PENDING" label={doc?.uploaded ? "Uploaded" : "Missing"} />
                              {doc?.uploaded && doc.preview_url && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  aria-label={`Preview securely: ${label}`}
                                  onClick={() => void handleKycPreview(documentType)}
                                >
                                  Preview securely
                                </Button>
                              )}
                              {doc?.uploaded && !doc.preview_url && (
                                <span className="text-xs text-text-muted">Preview unavailable; refresh booking</span>
                              )}
                              {canUpload && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  aria-label={`${chooseText}: ${label}`}
                                  disabled={uploadsBlocked}
                                  onClick={() => kycFileInputs.current[documentType]?.click()}
                                >
                                  {chooseText}
                                </Button>
                              )}
                            </div>
                          </div>
                          <input
                            ref={(element) => { kycFileInputs.current[documentType] = element; }}
                            type="file"
                            accept={acceptedKycFileTypes(documentType)}
                            className="sr-only"
                            // Opened by the button beside it, which is the keyboard stop.
                            tabIndex={-1}
                            hidden={!canUpload}
                            aria-label={`Choose ${label} file`}
                            disabled={!canUpload || uploadingKycType !== null}
                            onChange={(event) => {
                              const file = event.currentTarget.files?.[0] ?? null;
                              setSelectedKycFiles((current) => ({ ...current, [documentType]: file }));
                              setKycUploadErrors((current) => ({ ...current, [documentType]: "" }));
                              delete uploadKeys.current[documentType];
                            }}
                          />
                          {canUpload && selectedFile && (
                            <div className="mt-3 space-y-2 rounded-lg bg-surface-muted p-3">
                              <p className="break-all text-xs text-text-muted">Selected: {selectedFile.name}</p>
                              {replacingReopensKyc && (
                                <p className="text-xs font-medium text-warning">
                                  KYC is verified. Uploading this sets it back to Pending.
                                </p>
                              )}
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
                                aria-label={uploadRetrySeconds > 0 || isUploading ? undefined : `${uploadText}: ${label}`}
                                // Only a file that can't be sent blocks the button: after a failed upload it is the retry.
                                disabled={uploadsBlocked || fileProblem !== null}
                                onClick={() => void handleKycUpload(documentType)}
                              >
                                {isUploading
                                  ? "Uploading…"
                                  : uploadRetrySeconds > 0
                                    ? `Try again in ${uploadRetrySeconds}s`
                                    : uploadText}
                              </Button>
                            </div>
                          )}
                          {errors.map((error) => (
                            <p key={error} role="alert" className="mt-2 text-xs text-danger">
                              {error}
                            </p>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                  {canUpload && (
                    <p className="mt-3 text-xs text-text-soft">
                      {booking.is_offline
                        ? replacingReopensKyc
                          ? "KYC is verified. Replacing a document sets it back to Pending until it is verified again."
                          : "Uploading saves the document. It does not change the KYC status."
                        : "Uploading does not approve KYC. Review each document and approve the booking only after verification."}
                    </p>
                  )}
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
                        <p className="text-sm font-semibold text-text">{HISTORY_LABELS[item.action] ?? titleCase(item.action)}</p>
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

              {booking.status === "booked" && !booking.is_offline && (
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
                      {doc.viewable ? (
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            aria-label={`View ${doc.label}`}
                            disabled={downloadingDocument !== null || (doc.bookedOnly && !hasApplicationForm)}
                            onClick={() => handleViewDocument(doc)}
                          >
                            View
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            aria-label={`Download ${doc.label}`}
                            disabled={downloadingDocument !== null || (doc.bookedOnly && !hasApplicationForm)}
                            onClick={() => handleDownloadDocument(doc)}
                          >
                            {downloadingDocument === doc.kind ? "Preparing..." : "Download"}
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          disabled={downloadingDocument !== null || (doc.bookedOnly && !hasApplicationForm)}
                          onClick={() => handleDownloadDocument(doc)}
                        >
                          {downloadingDocument === doc.kind ? "Preparing..." : `Download ${doc.label}`}
                        </Button>
                      )}
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

      <DocumentPreviewModal preview={preview} onClose={() => setPreview(null)} />

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
        open={modal === "verifyKyc"}
        onClose={closeModal}
        title="Verify KYC"
        footer={
          <>
            <Button variant="outline" onClick={closeModal} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={() => submitDecision("verifyKyc")} disabled={submitting}>
              {submitting ? "Verifying..." : "Confirm Verified"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {actionError && modal === "verifyKyc" && (
            <div role="alert" className="rounded-xl border border-danger/30 bg-danger-bg p-3 text-sm text-danger">
              {actionError}
            </div>
          )}
          <p>
            Confirm that you have checked all 5 documents of{" "}
            <strong>{booking ? bookingApplicant(booking) : ""}</strong> for <strong>{booking?.id}</strong>. Their KYC
            status becomes Verified. The booking, plot and payments don't change, and no email is sent.
          </p>
          <textarea
            rows={3}
            maxLength={NOTE_MAX_LENGTH}
            aria-label="Note for the record (optional)"
            className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-text focus:border-gold focus:outline-none"
            placeholder="Note for the record (optional)"
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
