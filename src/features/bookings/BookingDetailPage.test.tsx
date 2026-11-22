import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, type ApiBookingDetail, type ApiPaymentMilestone } from "../../lib/api";
import { BookingDetailPage } from "./BookingDetailPage";

const getBooking = vi.fn();
const uploadBookingDocument = vi.fn();
const cancelBookedPlot = vi.fn();
const verifyBookingKyc = vi.fn();
const approveBooking = vi.fn();
const rejectBooking = vi.fn();
const recordInstallmentPayment = vi.fn();
const downloadAllotmentLetter = vi.fn();
const downloadDemandLetter = vi.fn();
const saveBlob = vi.fn();
vi.mock("../../lib/download", () => ({ saveBlob: (...args: unknown[]) => saveBlob(...args) }));
vi.mock("../../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/api")>()),
  getBooking: (...args: unknown[]) => getBooking(...args),
  uploadBookingDocument: (...args: unknown[]) => uploadBookingDocument(...args),
  cancelBookedPlot: (...args: unknown[]) => cancelBookedPlot(...args),
  verifyBookingKyc: (...args: unknown[]) => verifyBookingKyc(...args),
  approveBooking: (...args: unknown[]) => approveBooking(...args),
  rejectBooking: (...args: unknown[]) => rejectBooking(...args),
  recordInstallmentPayment: (...args: unknown[]) => recordInstallmentPayment(...args),
  downloadAllotmentLetter: (...args: unknown[]) => downloadAllotmentLetter(...args),
  downloadDemandLetter: (...args: unknown[]) => downloadDemandLetter(...args),
}));
// Mutable so a test can simulate a token refresh (which loads the booking again).
const auth = vi.hoisted(() => ({ accessToken: "token" }));
vi.mock("../../lib/auth", () => ({ useAuth: () => auth }));

function booking(overrides: Partial<ApiBookingDetail> = {}): ApiBookingDetail {
  return {
    id: "BKG-1", status: "booked", kyc_status: "pending", version: 1, admin_note: null,
    customer_id: "C1", customer_name: "Priya Shah", customer_email: "holder@example.com", customer_phone: "9999999999",
    project_name: "Suraksha Enclave", unit_number: "D7", amount: 100000, payment_id: "PAY-1", payment_method: "offline",
    payment_status: "paid", utr_number: null, cheque_number: null, documents: [], decision_history: [],
    payment_schedule: [], next_due: null, amount_received: null, payment_plan: null,
    created_at: "2026-03-21T06:30:00Z", last_activity_at: "2026-11-22T06:30:00Z", ...overrides,
  };
}

const offline = (overrides: Partial<ApiBookingDetail> = {}) =>
  booking({ is_offline: true, can_upload_documents: true, applicant_name: "Mr. Arun Rao", ...overrides });

const page = () => (
  <MemoryRouter initialEntries={["/admin/bookings/BKG-1"]}>
    <Link to="/admin/bookings/BKG-2">Next booking</Link>
    <Routes>
      <Route path="/admin/bookings/:id" element={<BookingDetailPage />} />
    </Routes>
  </MemoryRouter>
);

async function show(data: ApiBookingDetail) {
  getBooking.mockResolvedValue(data);
  const view = render(page());
  await screen.findByRole("heading", { name: "BKG-1" });
  /** A token refresh: the page loads the booking again. */
  return { refreshToken: () => { auth.accessToken += "+"; view.rerender(page()); } };
}

/** A reply the test sends when it wants to. */
function later<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  promise.catch(() => {});
  return {
    promise,
    reply: (value: T) => act(async () => resolve(value)),
    fail: (error: unknown) => act(async () => reject(error)),
  };
}

const DECIDED = /already been decided/;
const CHANGED = /This booking has changed since it was loaded/;
const valueOf = (label: string) => screen.getByText(label).nextElementSibling;

beforeEach(() => {
  auth.accessToken = "token";
  for (const mock of [
    getBooking, uploadBookingDocument, cancelBookedPlot, verifyBookingKyc, approveBooking, rejectBooking,
    recordInstallmentPayment, downloadAllotmentLetter, downloadDemandLetter, saveBlob,
  ])
    mock.mockReset();
  URL.createObjectURL = vi.fn(() => "blob:letter");
  URL.revokeObjectURL = vi.fn();
});

const TYPES = ["aadhaar_front", "aadhaar_back", "pan_card", "applicant_photo", "cancelled_cheque"] as const;
const LABELS = ["Aadhaar Card - Front", "Aadhaar Card - Back", "PAN Card", "Applicant Photo", "Cancelled Cheque"];
const EXISTING = "Existing customer. Upload their KYC documents below.";

/** The checklist as the server sends it, with `uploaded` types stored. */
const documents = (uploaded: readonly string[] = []) =>
  TYPES.map((document_type, i) => ({
    document_type, label: LABELS[i], uploaded: uploaded.includes(document_type),
    preview_url: uploaded.includes(document_type) ? `https://files.example/${document_type}` : null,
    preview_url_expires_in: 3600, uploaded_at: null,
  }));
const image = (name = "doc.png") => new File(["x"], name, { type: "image/png" });
const chooser = (label: string) => screen.getByLabelText<HTMLInputElement>(`Choose ${label} file`);
const uploadButton = (label: string) => screen.getByRole("button", { name: new RegExp(`^Upload (document|replacement): ${label}$`) });
const chooseButtons = () => screen.queryAllByRole("button", { name: /^Choose (file|replacement): / });
/** What the panel sent: document type, file, expected version, note, key. */
const sent = (call = 0) => {
  const [, , type, file, version, note, key] = uploadBookingDocument.mock.calls[call];
  return { type, file, version, note, key };
};
const refuse = (status: number, code: string, message = code, retryAfter: string | null = null) =>
  new ApiError(status, message, code, undefined, retryAfter, "req-42");

async function chooseAndUpload(user: ReturnType<typeof userEvent.setup>, label: string, file = image()) {
  await user.upload(chooser(label), file);
  await user.click(uploadButton(label));
}

describe("BookingDetailPage - who can upload KYC documents", () => {
  it("accepts an existing customer's documents although the booking is already booked", async () => {
    await show(offline({ documents: documents() }));
    expect(chooseButtons().map((b) => b.getAttribute("aria-label"))).toEqual(LABELS.map((l) => `Choose file: ${l}`));
    expect(chooser("PAN Card")).toBeEnabled();
    expect(screen.getByText(EXISTING)).toBeInTheDocument();
    expect(screen.queryByText(DECIDED)).not.toBeInTheDocument();
    expect(screen.getByText("Uploading saves the document. It does not change the KYC status.")).toBeInTheDocument();
    expect(screen.getAllByText("Missing")).toHaveLength(5);
  });

  it.each([
    ["a booked website booking", booking({ is_offline: false, can_upload_documents: false })],
    ["a rejected booking", booking({ status: "rejected", can_upload_documents: false })],
    ["a cancelled booking", booking({ status: "cancelled", can_upload_documents: false })],
    ["a cancelled existing customer's booking", offline({ status: "cancelled", can_upload_documents: false })],
    ["a booked booking on an older backend", booking()],
  ])("shows no upload controls on %s", async (_, data) => {
    await show(data);
    expect(chooseButtons()).toHaveLength(0);
    expect(chooser("PAN Card")).toBeDisabled();
    expect(chooser("PAN Card")).not.toBeVisible();
    expect(screen.getByText(DECIDED)).toBeInTheDocument();
    expect(screen.queryByText(EXISTING)).not.toBeInTheDocument();
  });

  it.each([
    ["the server's answer", booking({ status: "pending_kyc_review", can_upload_documents: true, documents: documents(TYPES) })],
    ["an older backend", booking({ status: "pending_kyc_review", documents: documents(TYPES) })],
  ])("keeps a booking under review as it was (%s)", async (_, data) => {
    await show(data);
    expect(chooseButtons()).toHaveLength(5);
    expect(screen.getByRole("button", { name: "Approve" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Reject" })).toBeEnabled();
    expect(screen.getByText(/Uploading does not approve KYC\. Review each document/)).toBeInTheDocument();
    expect(screen.queryByText(DECIDED)).not.toBeInTheDocument();
  });
});

describe("BookingDetailPage - uploading KYC documents", () => {
  it("uploads all five in a row, each with the latest version, without approving anything", async () => {
    const user = userEvent.setup();
    await show(offline({ documents: documents() }));
    for (const [i, type] of TYPES.entries()) {
      uploadBookingDocument.mockResolvedValueOnce(offline({ version: i + 2, documents: documents(TYPES.slice(0, i + 1)) }));
      await chooseAndUpload(user, LABELS[i]);
      expect(await screen.findByText(`${LABELS[i]} uploaded.`)).toBeInTheDocument();
      expect(sent(i)).toMatchObject({ type, version: i + 1 });
    }
    expect(new Set(TYPES.map((_, i) => sent(i).key)).size).toBe(5);
    expect(getBooking).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Missing")).not.toBeInTheDocument();
    expect(screen.getAllByText("Pending").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reject" })).toBeDisabled();
    expect(screen.getAllByRole("button", { name: /^Preview securely: / })).toHaveLength(5);
  });

  it("replaces an uploaded document, with the note", async () => {
    const user = userEvent.setup();
    await show(offline({ version: 7, documents: documents(["pan_card"]) }));
    uploadBookingDocument.mockResolvedValue(offline({ version: 8, documents: documents(["pan_card"]) }));
    const file = image("new-pan.png");
    await user.upload(chooser("PAN Card"), file);
    await user.type(screen.getByLabelText("Upload note (optional)"), "Name mismatch");
    await user.click(screen.getByRole("button", { name: "Upload replacement: PAN Card" }));
    await screen.findByText("PAN Card uploaded.");
    expect(sent()).toMatchObject({ type: "pan_card", file, version: 7, note: "Name mismatch" });
  });

  it("blocks every other upload while one is running", async () => {
    const user = userEvent.setup();
    let finish!: (b: ApiBookingDetail) => void;
    uploadBookingDocument.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    await show(offline({ documents: documents() }));
    await user.upload(chooser("Applicant Photo"), image());
    await chooseAndUpload(user, "PAN Card");
    expect(uploadButton("Applicant Photo")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Uploading…" })).toBeDisabled();
    for (const b of chooseButtons()) expect(b).toBeDisabled();
    finish(offline({ version: 2, documents: documents(["pan_card"]) }));
    await screen.findByText("PAN Card uploaded.");
    expect(uploadButton("Applicant Photo")).toBeEnabled();
  });

  it("accepts a PDF only for the cancelled cheque", async () => {
    const user = userEvent.setup({ applyAccept: false });
    const pdf = new File(["%PDF"], "scan.pdf", { type: "application/pdf" });
    await show(offline({ documents: documents() }));
    for (const label of LABELS.slice(0, 4)) {
      expect(chooser(label).accept).not.toContain("pdf");
      await user.upload(chooser(label), pdf);
      expect(uploadButton(label)).toBeDisabled();
    }
    expect(screen.getAllByText(/PDF is only accepted for a cancelled cheque\.$/)).toHaveLength(4);
    await user.upload(chooser("Cancelled Cheque"), pdf);
    expect(uploadButton("Cancelled Cheque")).toBeEnabled();
    expect(uploadBookingDocument).not.toHaveBeenCalled();
  });

  it("refuses a file over 10 MiB, and allows exactly 10 MiB", async () => {
    const user = userEvent.setup();
    const sized = (bytes: number) => Object.defineProperty(image(), "size", { value: bytes });
    await show(offline({ documents: documents() }));
    await user.upload(chooser("PAN Card"), sized(10 * 1024 * 1024 + 1));
    expect(screen.getByRole("alert")).toHaveTextContent("Maximum size is 10 MiB");
    expect(uploadButton("PAN Card")).toBeDisabled();
    await user.upload(chooser("PAN Card"), sized(10 * 1024 * 1024));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(uploadButton("PAN Card")).toBeEnabled();
  });

  it("works from the keyboard", async () => {
    const user = userEvent.setup();
    await show(offline({ documents: documents() }));
    const opened = vi.spyOn(chooser("PAN Card"), "click");
    const choose = screen.getByRole("button", { name: "Choose file: PAN Card" });
    choose.focus();
    await user.keyboard("{Enter}");
    expect(opened).toHaveBeenCalledTimes(1);
    expect(chooser("PAN Card")).toHaveAttribute("tabindex", "-1");

    uploadBookingDocument.mockResolvedValue(offline({ version: 2, documents: documents(["pan_card"]) }));
    await user.upload(chooser("PAN Card"), image());
    choose.focus();
    await user.tab();
    expect(screen.getByLabelText("Upload note (optional)")).toHaveFocus();
    await user.tab();
    expect(uploadButton("PAN Card")).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(await screen.findByText("PAN Card uploaded.")).toBeInTheDocument();
  });

  it("keeps the uploaded version when an older load (a preview) arrives late", async () => {
    const user = userEvent.setup();
    await show(offline({ documents: documents(["pan_card"]) }));
    let late!: (b: ApiBookingDetail) => void;
    getBooking.mockImplementationOnce(() => new Promise((resolve) => (late = resolve)));
    vi.spyOn(window, "open").mockReturnValue({ close: vi.fn(), location: { replace: vi.fn() } } as unknown as Window);
    await user.click(screen.getByRole("button", { name: "Preview securely: PAN Card" }));
    uploadBookingDocument.mockResolvedValueOnce(offline({ version: 2, documents: documents(["pan_card"]) }));
    await chooseAndUpload(user, "Applicant Photo");
    await screen.findByText("Applicant Photo uploaded.");
    late(offline({ version: 1, documents: documents(["pan_card"]) }));
    uploadBookingDocument.mockResolvedValueOnce(offline({ version: 3, documents: documents(["pan_card"]) }));
    await chooseAndUpload(user, "Cancelled Cheque");
    await screen.findByText("Cancelled Cheque uploaded.");
    expect(sent(1).version).toBe(2);
  });
});

describe("BookingDetailPage - when an upload is refused", () => {
  it.each([
    ["no connection", new TypeError("Failed to fetch"), /Could not connect to the document service/],
    ["500", refuse(500, "internal_error"), /Unable to upload.*Request ID: req-42/],
    ["503 storage", refuse(503, "document_storage_unavailable"), /temporarily unavailable\. Please try again/],
  ])("retries the same upload with the same key (%s)", async (_, error, message) => {
    const user = userEvent.setup();
    await show(offline({ documents: documents() }));
    uploadBookingDocument.mockRejectedValueOnce(error);
    uploadBookingDocument.mockResolvedValueOnce(offline({ version: 2, documents: documents(["pan_card"]) }));
    await chooseAndUpload(user, "PAN Card");
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    await user.click(uploadButton("PAN Card"));
    await screen.findByText("PAN Card uploaded.");
    expect(sent(1)).toEqual(sent(0));
  });

  it.each([
    ["file", async (user: ReturnType<typeof userEvent.setup>) => user.upload(chooser("PAN Card"), image("other.png"))],
    ["note", async (user: ReturnType<typeof userEvent.setup>) => user.type(screen.getByLabelText("Upload note (optional)"), "x")],
  ])("uses a new key after a new %s", async (_, change) => {
    const user = userEvent.setup();
    await show(offline({ documents: documents() }));
    uploadBookingDocument.mockRejectedValueOnce(refuse(503, "document_storage_unavailable"));
    uploadBookingDocument.mockResolvedValueOnce(offline({ version: 2, documents: documents(["pan_card"]) }));
    await chooseAndUpload(user, "PAN Card");
    await screen.findByRole("alert");
    await change(user);
    await user.click(uploadButton("PAN Card"));
    await screen.findByText("PAN Card uploaded.");
    expect(sent(1).key).not.toBe(sent(0).key);
  });

  it("uses a new key when another upload moved the booking on meanwhile", async () => {
    const user = userEvent.setup();
    await show(offline({ documents: documents() }));
    uploadBookingDocument.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    uploadBookingDocument.mockResolvedValueOnce(offline({ version: 2, documents: documents(["applicant_photo"]) }));
    uploadBookingDocument.mockResolvedValueOnce(offline({ version: 3, documents: documents(["applicant_photo", "pan_card"]) }));
    await chooseAndUpload(user, "PAN Card");
    await screen.findByRole("alert");
    await chooseAndUpload(user, "Applicant Photo");
    await screen.findByText("Applicant Photo uploaded.");
    await user.click(uploadButton("PAN Card"));
    await screen.findByText("PAN Card uploaded.");
    expect(sent(2)).toMatchObject({ type: "pan_card", version: 2 });
    expect(sent(2).key).not.toBe(sent(0).key);
  });

  it.each([
    [403, "forbidden", "x", /admin account is not approved/],
    [404, "booking_not_found", "x", /This booking no longer exists/],
    [413, "file_too_large", "x", /Maximum size is 10 MiB/],
    [415, "unsupported_media_type", "Encrypted PDFs are not supported.", /Encrypted PDFs are not supported\./],
    [422, "validation_error", "Note contains unsupported characters.", /Note contains unsupported characters\./],
  ])("explains %s %s beside its own document only", async (status, code, serverMessage, message) => {
    const user = userEvent.setup();
    await show(offline({ documents: documents() }));
    uploadBookingDocument.mockRejectedValue(refuse(status, code, serverMessage));
    await chooseAndUpload(user, "PAN Card");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(message);
    expect(alert.parentElement).toContainElement(uploadButton("PAN Card"));
  });

  it("reloads after a version conflict, keeps the file and retries with the new version and key", async () => {
    const user = userEvent.setup();
    await show(offline({ documents: documents() }));
    uploadBookingDocument.mockRejectedValueOnce(refuse(409, "version_conflict"));
    uploadBookingDocument.mockResolvedValueOnce(offline({ version: 6, documents: documents(["pan_card"]) }));
    getBooking.mockResolvedValue(offline({ version: 5, documents: documents(["applicant_photo"]) }));
    const file = image("kept.png");
    await chooseAndUpload(user, "PAN Card", file);
    expect(await screen.findByText(/your file is kept/)).toBeInTheDocument();
    expect(await screen.findByText("v5")).toBeInTheDocument();
    expect(screen.getByText("Selected: kept.png")).toBeInTheDocument();
    await user.click(uploadButton("PAN Card"));
    await screen.findByText("PAN Card uploaded.");
    expect(sent(1)).toMatchObject({ file, version: 5 });
    expect(sent(1).key).not.toBe(sent(0).key);
  });

  it("never blanks the page while it reloads", async () => {
    const user = userEvent.setup();
    await show(offline({ documents: documents() }));
    uploadBookingDocument.mockRejectedValue(refuse(409, "version_conflict"));
    getBooking.mockImplementation(() => new Promise(() => {}));
    await chooseAndUpload(user, "PAN Card");
    await screen.findByText(/your file is kept/);
    expect(screen.getByRole("heading", { name: "BKG-1" })).toBeInTheDocument();
    expect(screen.queryByText("Loading booking...")).not.toBeInTheDocument();
  });

  it("hides the controls once the booking stops accepting uploads, even if the reload fails", async () => {
    const user = userEvent.setup();
    await show(offline({ documents: documents() }));
    uploadBookingDocument.mockRejectedValue(refuse(409, "booking_not_uploadable"));
    getBooking.mockRejectedValue(new ApiError(500, "down"));
    await chooseAndUpload(user, "PAN Card");
    expect(await screen.findByText(/no longer accepts document uploads/)).toBeInTheDocument();
    expect(chooseButtons()).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /^Upload / })).not.toBeInTheDocument();
  });

  it("doesn't ask for a retry when the reloaded booking no longer accepts uploads", async () => {
    const user = userEvent.setup();
    await show(offline({ documents: documents() }));
    uploadBookingDocument.mockRejectedValue(refuse(409, "version_conflict"));
    getBooking.mockResolvedValue(offline({ version: 5, status: "cancelled", can_upload_documents: false }));
    await chooseAndUpload(user, "PAN Card");
    expect(await screen.findByText(/no longer accepts document uploads/)).toBeInTheDocument();
    expect(screen.queryByText(/press Upload again/)).not.toBeInTheDocument();
  });

  it("sends a key the server already used for something else again under a new one", async () => {
    const user = userEvent.setup();
    await show(offline({ documents: documents() }));
    uploadBookingDocument.mockRejectedValueOnce(refuse(409, "idempotency_conflict"));
    uploadBookingDocument.mockResolvedValueOnce(offline({ version: 2, documents: documents(["pan_card"]) }));
    await chooseAndUpload(user, "PAN Card");
    await screen.findByText(/Press Upload to send it again/);
    await user.click(uploadButton("PAN Card"));
    await screen.findByText("PAN Card uploaded.");
    expect(sent(1).key).not.toBe(sent(0).key);
  });

  it("waits for Retry-After before any upload can be tried again, then keeps the key", async () => {
    const user = userEvent.setup();
    await show(offline({ documents: documents() }));
    uploadBookingDocument.mockRejectedValueOnce(refuse(429, "rate_limited", "x", "1"));
    uploadBookingDocument.mockResolvedValueOnce(offline({ version: 2, documents: documents(["pan_card"]) }));
    await chooseAndUpload(user, "PAN Card");
    expect(await screen.findByRole("button", { name: "Try again in 1s" })).toBeDisabled();
    for (const b of chooseButtons()) expect(b).toBeDisabled();
    await waitFor(() => expect(uploadButton("PAN Card")).toBeEnabled(), { timeout: 4000 });
    await user.click(uploadButton("PAN Card"));
    await screen.findByText("PAN Card uploaded.");
    expect(sent(1).key).toBe(sent(0).key);
  });

  it("treats a saved upload whose reply was lost as saved", async () => {
    const user = userEvent.setup();
    await show(offline({ documents: documents() }));
    uploadBookingDocument.mockRejectedValue(refuse(503, "document_saved_refresh_failed"));
    getBooking.mockResolvedValue(offline({ version: 2, documents: documents(["pan_card"]) }));
    await chooseAndUpload(user, "PAN Card");
    expect(await screen.findByText("PAN Card uploaded.")).toBeInTheDocument();
    expect(screen.getByText("v2")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("still says it was saved when the booking can't be reloaded", async () => {
    const user = userEvent.setup();
    await show(offline({ documents: documents() }));
    uploadBookingDocument.mockRejectedValue(refuse(503, "document_saved_refresh_failed"));
    getBooking.mockRejectedValue(new ApiError(500, "down"));
    await chooseAndUpload(user, "PAN Card");
    expect(await screen.findByText(/was saved, but the booking could not be reloaded\. Refresh the page.*req-42/)).toBeInTheDocument();
  });
});

describe("BookingDetailPage - verifying an existing customer's KYC", () => {
  const ready = (o: Partial<ApiBookingDetail> = {}) =>
    offline({ version: 6, documents: documents(TYPES), can_verify_kyc: true, ...o });
  const verified = (o: Partial<ApiBookingDetail> = {}) =>
    ready({ version: 7, kyc_status: "verified", can_verify_kyc: false, ...o });
  const verifyButton = () => screen.queryByRole("button", { name: "Verify KYC" });
  const confirm = () => screen.getByRole("button", { name: "Confirm Verified" });

  it("verifies after a confirmation, and needs no approve or reject", async () => {
    const user = userEvent.setup();
    await show(ready());
    expect(screen.getByText(/review each one, then verify KYC/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();

    verifyBookingKyc.mockResolvedValue(
      verified({ decision_history: [{ actor: "A1", action: "kyc_verified", note: "Originals seen", created_at: "2026-11-22T10:00:00Z" }] })
    );
    await user.click(verifyButton()!);
    expect(verifyBookingKyc).not.toHaveBeenCalled();
    expect(screen.getByText(/no email is sent/)).toHaveTextContent("Mr. Arun Rao");
    await user.type(screen.getByLabelText("Note for the record (optional)"), " Originals seen ");
    await user.click(confirm());

    expect(await screen.findByText("KYC verified.")).toBeInTheDocument();
    expect(verifyBookingKyc).toHaveBeenCalledWith("token", "BKG-1", { note: "Originals seen", version: 6 });
    expect(screen.getAllByText("Verified").length).toBeGreaterThan(0);
    expect(screen.getByText("KYC Verified")).toBeInTheDocument();
    expect(screen.getByText("Existing customer. KYC is verified.")).toBeInTheDocument();
    expect(verifyButton()).not.toBeInTheDocument();
  });

  it("waits for all 5 documents, and for an upload that is still running", async () => {
    const user = userEvent.setup();
    let finish!: (b: ApiBookingDetail) => void;
    await show(offline({ version: 5, documents: documents(TYPES.slice(0, 4)), can_verify_kyc: false }));
    expect(verifyButton()).toBeDisabled();
    expect(screen.getByText(EXISTING)).toBeInTheDocument();
    uploadBookingDocument.mockResolvedValueOnce(ready());
    await chooseAndUpload(user, "Cancelled Cheque");
    await screen.findByText("Cancelled Cheque uploaded.");
    expect(verifyButton()).toBeEnabled();

    uploadBookingDocument.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    await chooseAndUpload(user, "PAN Card");
    expect(verifyButton()).toBeDisabled();
    finish(ready({ version: 7 }));
    await screen.findByText("PAN Card uploaded.");
    expect(verifyButton()).toBeEnabled();
  });

  it("warns that replacing a verified document reopens KYC, and says when it did", async () => {
    const user = userEvent.setup();
    await show(verified());
    expect(screen.getByText(/Replacing a document sets it back to Pending/)).toBeInTheDocument();
    await user.upload(chooser("PAN Card"), image());
    expect(screen.getByText("KYC is verified. Uploading this sets it back to Pending.")).toBeInTheDocument();
    uploadBookingDocument.mockResolvedValue(
      ready({ version: 8, decision_history: [{ actor: "A1", action: "kyc_reopened", note: null, created_at: "2026-11-22T10:00:00Z" }] })
    );
    await user.click(uploadButton("PAN Card"));
    expect(await screen.findByText("PAN Card uploaded. KYC is back to Pending until it is verified again.")).toBeInTheDocument();
    expect(screen.getByText("KYC Back to Pending")).toBeInTheDocument();
    expect(verifyButton()).toBeEnabled();
  });

  it("shows the latest documents instead of verifying when one changed meanwhile, keeping a chosen file", async () => {
    const user = userEvent.setup();
    await show(ready());
    await user.upload(chooser("PAN Card"), image("kept.png"));
    verifyBookingKyc.mockRejectedValue(refuse(409, "version_conflict"));
    getBooking.mockResolvedValue(ready({ version: 9 }));
    await user.click(verifyButton()!);
    await user.click(confirm());
    expect(await screen.findByText(/changed since it was loaded, so KYC was not verified/)).toBeInTheDocument();
    expect(await screen.findByText("v9")).toBeInTheDocument();
    expect(screen.getByText("Selected: kept.png")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm Verified" })).not.toBeInTheDocument();

    verifyBookingKyc.mockResolvedValue(verified({ version: 10 }));
    await user.click(verifyButton()!);
    await user.click(confirm());
    await screen.findByText("KYC verified.");
    expect(verifyBookingKyc.mock.calls[1][2]).toMatchObject({ version: 9 });
  });

  it.each([
    ["version_conflict", "x", /Refresh the page to see whether KYC is verified/],
    ["kyc_documents_missing", "Upload all 5 KYC documents before verifying.", /^Upload all 5 KYC documents before verifying\. The latest details could not be loaded/],
    ["kyc_already_verified", "KYC is already verified for this booking.", /^KYC is already verified for this booking\. The latest details could not be loaded/],
    ["kyc_not_verifiable", "Only for an existing customer.", /^Only for an existing customer\. The latest details could not be loaded/],
  ])("keeps the real reason when the reload fails too (%s)", async (code, message, shownText) => {
    const user = userEvent.setup();
    await show(ready());
    verifyBookingKyc.mockRejectedValue(refuse(409, code, message));
    getBooking.mockRejectedValue(new ApiError(500, "down"));
    await user.click(verifyButton()!);
    await user.click(confirm());
    expect(await screen.findByText(shownText)).toBeInTheDocument();
    expect(screen.queryByText(/KYC was not verified/)).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it.each(["version_conflict", "kyc_already_verified"])("says KYC is verified when the latest details show it (%s)", async (code) => {
    const user = userEvent.setup();
    await show(ready());
    verifyBookingKyc.mockRejectedValue(refuse(409, code, "refused"));
    getBooking.mockResolvedValue(verified());
    await user.click(verifyButton()!);
    await user.click(confirm());
    expect(await screen.findByText("KYC is already verified.")).toBeInTheDocument();
    expect(screen.queryByText(/not verified|refused|check the documents again/)).not.toBeInTheDocument();
    expect(verifyButton()).not.toBeInTheDocument();
  });

  it("recognises its own verification when the reply was lost and the admin tries again", async () => {
    const user = userEvent.setup();
    await show(ready());
    verifyBookingKyc.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    verifyBookingKyc.mockRejectedValueOnce(refuse(409, "version_conflict"));
    getBooking.mockResolvedValue(verified());
    await user.click(verifyButton()!);
    await user.click(confirm());
    expect((await screen.findAllByText("Something went wrong. Please try again.")).length).toBeGreaterThan(0);
    await user.click(confirm());
    expect(await screen.findByText("KYC is already verified.")).toBeInTheDocument();
    expect(verifyBookingKyc.mock.calls[1][2]).toMatchObject({ version: 6 });
    expect(screen.queryByText(/Something went wrong/)).not.toBeInTheDocument();
  });

  it("doesn't claim KYC is verified when a document changed right after", async () => {
    const user = userEvent.setup();
    await show(ready());
    verifyBookingKyc.mockResolvedValue(ready({ version: 8 }));
    await user.click(verifyButton()!);
    await user.click(confirm());
    expect(await screen.findByText(CHANGED)).toBeInTheDocument();
    expect(screen.queryByText("KYC verified.")).not.toBeInTheDocument();
    expect(verifyButton()).toBeEnabled();
  });

  it("sends a decision once, however fast it is confirmed", async () => {
    const user = userEvent.setup();
    const answer = later<ApiBookingDetail>();
    verifyBookingKyc.mockReturnValue(answer.promise);
    await show(ready());
    await user.click(verifyButton()!);
    const button = confirm();
    // Both clicks land before the button is drawn as disabled.
    act(() => {
      button.click();
      button.click();
    });
    expect(verifyBookingKyc).toHaveBeenCalledTimes(1);
    await answer.reply(verified());
    expect(screen.getByText("KYC verified.")).toBeInTheDocument();
  });

  it.each([
    [409, "kyc_documents_missing", "Upload all 5 KYC documents before verifying.", /Upload all 5 KYC documents before verifying/],
    [409, "kyc_already_verified", "KYC is already verified for this booking.", /already verified for this booking/],
    [403, "forbidden", "x", /admin account is not approved, so it can't verify KYC/],
    [404, "not_found", "not_found", /could not be found/],
    [500, "internal_error", "internal_error", /Something went wrong\. Please try again/],
    [422, "validation", "note: too long", /note: too long/],
  ])("explains %s %s", async (status, code, message, shown) => {
    const user = userEvent.setup();
    await show(ready());
    verifyBookingKyc.mockRejectedValue(refuse(status, code, message));
    await user.click(verifyButton()!);
    await user.click(confirm());
    expect((await screen.findAllByText(shown)).length).toBeGreaterThan(0);
    expect(screen.queryByText("KYC verified.")).not.toBeInTheDocument();
  });

  it.each([
    ["an older backend", offline({ documents: documents(TYPES) })],
    ["a website booking", booking({ is_offline: false, can_upload_documents: false, can_verify_kyc: false })],
    ["a website booking under review", booking({ status: "pending_kyc_review", is_offline: false, can_verify_kyc: false })],
    ["a cancelled existing customer's booking", offline({ status: "cancelled", can_upload_documents: false, can_verify_kyc: false })],
  ])("doesn't appear on %s", async (_, data) => {
    await show(data);
    expect(verifyButton()).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
  });
});

describe("BookingDetailPage - KYC verified, or not, when the server is having trouble", () => {
  const ready = (o: Partial<ApiBookingDetail> = {}) =>
    offline({ version: 6, documents: documents(TYPES), can_verify_kyc: true, ...o });
  const verified = (o: Partial<ApiBookingDetail> = {}) =>
    ready({ version: 7, kyc_status: "verified", can_verify_kyc: false, ...o });
  const verifyButton = () => screen.queryByRole("button", { name: "Verify KYC" });
  const confirm = () => screen.getByRole("button", { name: "Confirm Verified" });
  const reload = () => screen.getByRole("button", { name: "Reload booking" });
  const kycBadge = () => valueOf("KYC Status")?.textContent;
  const SAVED = /KYC was verified, but the booking could not be reloaded/;
  const saved = () => refuse(503, "kyc_verified_refresh_failed", "KYC was verified, but the booking could not be reloaded.");

  async function verify(user: ReturnType<typeof userEvent.setup>) {
    await user.click(verifyButton()!);
    await user.click(confirm());
  }

  it("reloads a verification that was saved, and never sends it again", async () => {
    const user = userEvent.setup();
    await show(ready());
    verifyBookingKyc.mockRejectedValue(saved());
    getBooking.mockResolvedValue(verified());
    await verify(user);
    expect(await screen.findByText("KYC verified.")).toBeInTheDocument();
    expect(kycBadge()).toBe("Verified");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText(SAVED)).not.toBeInTheDocument();
    expect(screen.queryByText(CHANGED)).not.toBeInTheDocument();
    expect(verifyBookingKyc).toHaveBeenCalledTimes(1);
  });

  it("doesn't offer to verify again when the reload fails too, until a reload works", async () => {
    const user = userEvent.setup();
    await show(ready());
    verifyBookingKyc.mockRejectedValue(saved());
    getBooking.mockRejectedValue(new ApiError(500, "down"));
    await verify(user);
    expect(await screen.findByText(SAVED)).toHaveTextContent("no need to verify it again");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(verifyButton()).toBeDisabled();
    // The badge is the last response's, never guessed.
    expect(kycBadge()).toBe("Pending");
    expect(screen.queryByText(/review each one, then verify KYC/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Something went wrong|not verified/)).not.toBeInTheDocument();

    await user.click(reload());
    expect(await screen.findByText(SAVED)).toBeInTheDocument();
    expect(reload()).toBeEnabled();
    getBooking.mockResolvedValue(verified());
    await user.click(reload());
    expect(await screen.findByText("KYC verified.")).toBeInTheDocument();
    expect(kycBadge()).toBe("Verified");
    expect(screen.queryByText(SAVED)).not.toBeInTheDocument();
    expect(screen.queryByText(CHANGED)).not.toBeInTheDocument();
    expect(verifyBookingKyc).toHaveBeenCalledTimes(1);
  });

  it("doesn't believe a reload from before the verification (a lagging server)", async () => {
    const user = userEvent.setup();
    await show(ready());
    verifyBookingKyc.mockRejectedValue(saved());
    getBooking.mockResolvedValue(ready());
    await verify(user);
    expect(await screen.findByText(SAVED)).toBeInTheDocument();
    expect(verifyButton()).toBeDisabled();
    await user.click(reload());
    await waitFor(() => expect(reload()).toBeEnabled());
    expect(verifyButton()).toBeDisabled();
    expect(screen.queryByText("KYC verified.")).not.toBeInTheDocument();
  });

  it.each([
    ["at once", true],
    ["with the button", false],
  ])("shows Pending, and allows verifying again, when a document was replaced before it was read back (%s)", async (_, atOnce) => {
    const user = userEvent.setup();
    await show(ready());
    verifyBookingKyc.mockRejectedValueOnce(saved());
    if (!atOnce) getBooking.mockRejectedValueOnce(new ApiError(500, "down"));
    getBooking.mockResolvedValue(ready({ version: 8 }));
    await verify(user);
    if (!atOnce) await user.click(await screen.findByRole("button", { name: "Reload booking" }));
    expect(await screen.findByText(CHANGED)).toBeInTheDocument();
    expect(kycBadge()).toBe("Pending");
    expect(screen.queryByText("KYC verified.")).not.toBeInTheDocument();
    expect(screen.queryByText(SAVED)).not.toBeInTheDocument();

    verifyBookingKyc.mockResolvedValue(verified({ version: 9 }));
    await verify(user);
    expect(await screen.findByText("KYC verified.")).toBeInTheDocument();
    expect(verifyBookingKyc.mock.calls[1][2]).toMatchObject({ version: 8 });
  });

  it.each(["a token refresh", "a preview"])("catches up quietly through %s", async (how) => {
    const user = userEvent.setup();
    popup();
    const { refreshToken } = await show(ready());
    verifyBookingKyc.mockRejectedValue(saved());
    getBooking.mockRejectedValueOnce(new ApiError(500, "down"));
    await verify(user);
    await screen.findByText(SAVED);
    getBooking.mockResolvedValue(verified());
    if (how === "a preview") await user.click(previewButton("PAN Card"));
    else refreshToken();
    await waitFor(() => expect(screen.queryByText(SAVED)).not.toBeInTheDocument());
    expect(await screen.findByText("Existing customer. KYC is verified.")).toBeInTheDocument();
    expect(kycBadge()).toBe("Verified");
    expect(screen.queryByText(CHANGED)).not.toBeInTheDocument();
  });

  it("drops a saved verification of a booking the admin has left", async () => {
    const user = userEvent.setup();
    const answer = later<ApiBookingDetail>();
    verifyBookingKyc.mockReturnValue(answer.promise);
    await show(ready());
    await verify(user);
    getBooking.mockResolvedValue(ready({ id: "BKG-2", version: 1 }));
    await user.click(screen.getByRole("link", { name: "Next booking" }));
    await screen.findByRole("heading", { name: "BKG-2" });
    await answer.fail(saved());
    expect(screen.queryByText(SAVED)).not.toBeInTheDocument();
    expect(verifyButton()).toBeEnabled();
    expect(kycBadge()).toBe("Pending");
  });

  it("keeps the dialog open to try again when the documents can't be opened", async () => {
    const user = userEvent.setup();
    await show(ready());
    verifyBookingKyc.mockRejectedValueOnce(refuse(503, "kyc_documents_unavailable", "x"));
    verifyBookingKyc.mockResolvedValueOnce(verified());
    await user.click(verifyButton()!);
    await user.type(screen.getByLabelText("Note for the record (optional)"), "seen");
    await user.click(confirm());
    expect(await screen.findByRole("alert")).toHaveTextContent("can't be opened right now, so KYC was not verified. Please try again");
    expect(kycBadge()).toBe("Pending");
    expect(screen.getByLabelText("Note for the record (optional)")).toHaveValue("seen");
    expect(getBooking).toHaveBeenCalledTimes(1);

    await user.click(confirm());
    expect(await screen.findByText("KYC verified.")).toBeInTheDocument();
    expect(verifyBookingKyc.mock.calls[1]).toEqual(verifyBookingKyc.mock.calls[0]);
    expect(screen.queryByText(/can't be opened right now/)).not.toBeInTheDocument();
  });

  it.each([
    ["one", ["pan_card"]],
    ["all", [...TYPES]],
  ])("says why KYC can't be verified while %s of the documents can't be opened, and reloads", async (_, closed) => {
    const user = userEvent.setup();
    const unopenable = documents(TYPES).map((d) => (closed.includes(d.document_type) ? { ...d, preview_url: null } : d));
    await show(ready({ documents: unopenable, can_verify_kyc: false }));
    expect(screen.getByText(/Some documents can't be opened right now, so KYC can't be verified yet/)).toBeInTheDocument();
    expect(verifyButton()).toBeDisabled();
    expect(verifyButton()).toHaveAttribute("title", "Some documents can't be opened right now");

    getBooking.mockRejectedValueOnce(new ApiError(500, "down"));
    await user.click(reload());
    expect(await screen.findByText(/latest details of this booking could not be loaded/)).toBeInTheDocument();
    getBooking.mockResolvedValue(ready());
    await user.click(reload());
    expect(await screen.findByText(/review each one, then verify KYC/)).toBeInTheDocument();
    expect(verifyButton()).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Reload booking" })).not.toBeInTheDocument();
    expect(screen.queryByText(/could not be loaded/)).not.toBeInTheDocument();
    expect(screen.queryByText(CHANGED)).not.toBeInTheDocument();
  });

  it("warns when that reload shows the booking changed", async () => {
    const user = userEvent.setup();
    await show(ready({ documents: documents(TYPES).map((d) => ({ ...d, preview_url: null })), can_verify_kyc: false }));
    getBooking.mockResolvedValue(ready({ version: 9 }));
    await user.click(reload());
    expect(await screen.findByText(CHANGED)).toBeInTheDocument();
  });

  it.each<[string, Partial<ApiBookingDetail>]>([
    ["KYC is verified", { kyc_status: "verified", can_verify_kyc: false }],
    ["the backend can't verify KYC here", { can_verify_kyc: undefined }],
    ["documents are missing", { can_verify_kyc: false, documents: documents(["pan_card"]).map((d) => ({ ...d, preview_url: null })) }],
  ])("doesn't bring up unopenable documents when %s", async (_, overrides) => {
    await show(ready({ documents: documents(TYPES).map((d) => ({ ...d, preview_url: null })), ...overrides }));
    expect(screen.queryByText(/can't be opened right now/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reload booking" })).not.toBeInTheDocument();
  });
});

describe("BookingDetailPage - the KYC badge is always the response's", () => {
  const kycBadges = () => [valueOf("KYC Status")?.textContent, screen.getByRole("heading", { name: "KYC Document Checklist" }).nextElementSibling?.textContent];
  const state = (version: number, kyc_status: ApiBookingDetail["kyc_status"]) =>
    offline({ version, kyc_status, documents: documents(TYPES), can_verify_kyc: kyc_status !== "verified" });

  it.each<[string, ApiBookingDetail["kyc_status"], string]>([
    ["put back to pending", "pending", "Pending"],
    ["still verified (verified again before a repeated upload's reply)", "verified", "Verified"],
    ["any other status", "needs_resubmission", "Needs Resubmission"],
  ])("after replacing a document of a verified booking: %s", async (_, after, badge) => {
    const user = userEvent.setup();
    await show(state(7, "verified"));
    expect(kycBadges()).toEqual(["Verified", "Verified"]);
    uploadBookingDocument.mockResolvedValue(state(8, after));
    await chooseAndUpload(user, "PAN Card");
    await screen.findByText(/^PAN Card uploaded\./);
    expect(kycBadges()).toEqual([badge, badge]);
    expect(screen.queryAllByText(/KYC is back to Pending/)).toHaveLength(after === "verified" ? 0 : 1);
  });

  it("after a saved replacement whose reply was lost", async () => {
    const user = userEvent.setup();
    await show(state(7, "verified"));
    uploadBookingDocument.mockRejectedValue(refuse(503, "document_saved_refresh_failed"));
    getBooking.mockResolvedValue(state(8, "pending"));
    await chooseAndUpload(user, "PAN Card");
    expect(await screen.findByText(/KYC is back to Pending/)).toBeInTheDocument();
    expect(kycBadges()).toEqual(["Pending", "Pending"]);
  });

  it("keeps the last response's while a replacement fails", async () => {
    const user = userEvent.setup();
    await show(state(7, "verified"));
    uploadBookingDocument.mockRejectedValue(refuse(503, "document_storage_unavailable"));
    await chooseAndUpload(user, "PAN Card");
    await screen.findByRole("alert");
    expect(kycBadges()).toEqual(["Verified", "Verified"]);
  });

  it("goes by the newer booking when an upload's reply arrives behind it", async () => {
    const user = userEvent.setup();
    popup();
    await show(state(7, "verified"));
    const upload = later<ApiBookingDetail>();
    uploadBookingDocument.mockReturnValue(upload.promise);
    await chooseAndUpload(user, "PAN Card");
    getBooking.mockResolvedValue(state(9, "verified")); // replaced, then verified again by someone else
    await user.click(previewButton("Cancelled Cheque"));
    await screen.findByText("v9");
    await upload.reply(state(8, "pending"));
    expect(await screen.findByText("PAN Card uploaded.")).toBeInTheDocument();
    expect(kycBadges()).toEqual(["Verified", "Verified"]);
    expect(screen.queryByText(/KYC is back to Pending/)).not.toBeInTheDocument();
  });
});

describe("BookingDetailPage - whose booking it is", () => {
  it("names the applicant everywhere and marks the contact details as the account holder's", async () => {
    await show(offline());
    expect(screen.getByText("Mr. Arun Rao · Suraksha Enclave · Unit D7")).toBeInTheDocument();
    expect(valueOf("Customer")).toHaveTextContent("Mr. Arun Rao");
    expect(valueOf("Account Holder")).toHaveTextContent("Priya Shah");
    expect(valueOf("Account Holder's Email")).toHaveTextContent("holder@example.com");
    expect(valueOf("Account Holder's Phone")).toHaveTextContent("9999999999");
  });

  it("adds no account holder when only a salutation or spelling differs", async () => {
    await show(offline({ applicant_name: "Ms.  PRIYA shah" }));
    expect(screen.queryByText("Account Holder")).not.toBeInTheDocument();
    expect(valueOf("Email")).toHaveTextContent("holder@example.com");
  });

  it("shows the account holder when the applicant isn't known, and the ID when neither is", async () => {
    await show(booking({ applicant_name: null, customer_name: null as unknown as string }));
    expect(screen.getByText("C1 · Suraksha Enclave · Unit D7")).toBeInTheDocument();
  });
});

describe("BookingDetailPage - an offline booking can't be cancelled here", () => {
  it("hides cancelling and the receipt", async () => {
    await show(offline());
    expect(screen.queryByRole("button", { name: "Cancel Plot Booked" })).not.toBeInTheDocument();
    expect(screen.queryByText("Receipt")).not.toBeInTheDocument();
  });

  it("explains the server's refusal if an old page still offers it", async () => {
    const user = userEvent.setup();
    await show(booking());
    cancelBookedPlot.mockRejectedValue(new ApiError(409, "offline_booking_not_cancellable", "offline_booking_not_cancellable"));
    await user.click(screen.getByRole("button", { name: "Cancel Plot Booked" }));
    await user.click(screen.getByRole("button", { name: "Confirm Cancel" }));
    expect((await screen.findAllByText(/sold offline, so it can't be cancelled/)).length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Replies that cross, arrive late, or belong to a booking the admin has left
// ---------------------------------------------------------------------------

const allDocs = (o: Partial<ApiBookingDetail> = {}) =>
  offline({ version: 6, documents: documents(TYPES), can_verify_kyc: true, ...o });
const previewButton = (label: string) => screen.getByRole("button", { name: `Preview securely: ${label}` });

function popup() {
  const opened = { close: vi.fn(), location: { replace: vi.fn() } };
  vi.spyOn(window, "open").mockReturnValue(opened as unknown as Window);
  return opened;
}

function milestone(overrides: Partial<ApiPaymentMilestone> = {}): ApiPaymentMilestone {
  return {
    id: "m1", label: "Instalment", percent: 100, due_days: 0, due_date: "2026-11-01", amount: 5000, status: "due",
    pay_enabled_from: "2026-01-01", paid_on: null, paid_payment_id: null, ...overrides,
  };
}
const paid = () => milestone({ status: "paid", paid_on: "2026-11-20T10:00:00Z", paid_payment_id: "PAY-9" });

async function recordInstalment(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Record Payment" }));
  await user.click(screen.getByRole("button", { name: "Confirm Received" }));
}

describe("BookingDetailPage - letters requested while the booking changes", () => {
  const withPlan = (o: Partial<ApiBookingDetail> = {}) =>
    offline({ documents: documents(["pan_card"]), payment_schedule: [milestone()], ...o });
  const letter = { blob: new Blob(["%PDF"], { type: "application/pdf" }), filename: "letter.pdf" };
  const allotment = () => screen.getByRole("button", { name: /Download Allotment Letter|Preparing/ });

  it("still saves a download when an upload finishes first", async () => {
    const user = userEvent.setup();
    const download = later<typeof letter>();
    downloadAllotmentLetter.mockReturnValue(download.promise);
    uploadBookingDocument.mockResolvedValue(withPlan({ version: 2 }));
    await show(withPlan());
    await user.click(allotment());
    await chooseAndUpload(user, "Applicant Photo");
    await screen.findByText("Applicant Photo uploaded.");
    await download.reply(letter);
    expect(saveBlob).toHaveBeenCalledWith(letter.blob, "letter.pdf");
    expect(allotment()).toBeEnabled();
    expect(screen.getByRole("button", { name: "View Demand Letter" })).toBeEnabled();
  });

  it("still reports a failed download, and frees the buttons", async () => {
    const user = userEvent.setup();
    const download = later<typeof letter>();
    downloadAllotmentLetter.mockReturnValue(download.promise);
    uploadBookingDocument.mockResolvedValue(withPlan({ version: 2 }));
    await show(withPlan());
    await user.click(allotment());
    await chooseAndUpload(user, "Applicant Photo");
    await download.fail(new TypeError("Failed to fetch"));
    expect(screen.getByText(/Could not connect to the document service/)).toBeInTheDocument();
    expect(allotment()).toBeEnabled();
    expect(saveBlob).not.toHaveBeenCalled();
  });

  it("still opens a letter being viewed when the booking is reloaded meanwhile", async () => {
    const user = userEvent.setup();
    const download = later<typeof letter>();
    downloadDemandLetter.mockReturnValue(download.promise);
    popup();
    await show(withPlan());
    await user.click(screen.getByRole("button", { name: "View Demand Letter" }));
    await user.click(previewButton("PAN Card"));
    await download.reply(letter);
    expect(await screen.findByTitle("Demand Letter")).toBeInTheDocument();
  });

  it("doesn't let an earlier try's failure replace a letter that opened", async () => {
    const user = userEvent.setup();
    const first = later<typeof letter>();
    downloadDemandLetter.mockReturnValueOnce(first.promise).mockResolvedValueOnce(letter);
    await show(withPlan());
    const view = screen.getByRole("button", { name: "View Demand Letter" });
    await user.click(view);
    await user.click(within(screen.getByRole("dialog")).getAllByRole("button", { name: "Close" })[0]);
    await user.click(view);
    expect(await screen.findByTitle("Demand Letter")).toBeInTheDocument();
    await first.fail(new TypeError("Failed to fetch"));
    expect(screen.getByTitle("Demand Letter")).toBeInTheDocument();
  });

  it("drops a download for a booking the admin has left, without blocking the next one", async () => {
    const user = userEvent.setup();
    const download = later<typeof letter>();
    downloadAllotmentLetter.mockReturnValue(download.promise);
    await show(withPlan());
    await user.click(allotment());
    getBooking.mockResolvedValue(withPlan({ id: "BKG-2" }));
    await user.click(screen.getByRole("link", { name: "Next booking" }));
    await screen.findByRole("heading", { name: "BKG-2" });
    expect(allotment()).toBeEnabled();
    await download.reply(letter);
    expect(saveBlob).not.toHaveBeenCalled();
  });
});

describe("BookingDetailPage - deciding only on what the admin saw", () => {
  const verifyButton = () => screen.getByRole("button", { name: "Verify KYC" });
  const confirm = () => screen.getByRole("button", { name: "Confirm Verified" });

  it("says so when a preview brings a changed booking", async () => {
    const user = userEvent.setup();
    const opened = popup();
    await show(allDocs());
    getBooking.mockResolvedValue(allDocs({ version: 7 }));
    await user.click(previewButton("Aadhaar Card - Front"));
    expect(await screen.findByText(CHANGED)).toBeInTheDocument();
    expect(opened.location.replace).toHaveBeenCalledWith("https://files.example/aadhaar_front");

    // Uploading something else doesn't hide it; opening the decision does.
    uploadBookingDocument.mockResolvedValue(allDocs({ version: 8 }));
    await chooseAndUpload(user, "PAN Card");
    await screen.findByText("PAN Card uploaded.");
    expect(screen.getByText(CHANGED)).toBeInTheDocument();
    await user.click(verifyButton());
    expect(screen.queryByText(CHANGED)).not.toBeInTheDocument();
  });

  it("stays quiet when a preview brings the same version", async () => {
    const user = userEvent.setup();
    popup();
    await show(allDocs());
    await user.click(previewButton("PAN Card"));
    await waitFor(() => expect(getBooking).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(CHANGED)).not.toBeInTheDocument();
  });

  it("closes an open dialog when a slow preview shows the booking changed", async () => {
    const user = userEvent.setup();
    popup();
    await show(allDocs());
    const slow = later<ApiBookingDetail>();
    getBooking.mockReturnValueOnce(slow.promise);
    await user.click(previewButton("PAN Card"));
    await user.click(verifyButton());
    await slow.reply(allDocs({ version: 7 }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText(CHANGED)).toBeInTheDocument();
    expect(verifyBookingKyc).not.toHaveBeenCalled();

    verifyBookingKyc.mockResolvedValue(allDocs({ version: 8, kyc_status: "verified", can_verify_kyc: false }));
    await user.click(verifyButton());
    await user.click(confirm());
    await screen.findByText("KYC verified.");
    expect(verifyBookingKyc.mock.calls[0][2]).toMatchObject({ version: 7 });
  });

  it("sends the version the dialog was opened on, even if a newer one shows while it is being sent", async () => {
    const user = userEvent.setup();
    popup();
    await show(allDocs());
    const slow = later<ApiBookingDetail>();
    const answer = later<ApiBookingDetail>();
    getBooking.mockReturnValueOnce(slow.promise);
    verifyBookingKyc.mockReturnValue(answer.promise);
    await user.click(previewButton("PAN Card"));
    await user.click(verifyButton());
    await user.click(confirm());
    expect(verifyBookingKyc.mock.calls[0][2]).toMatchObject({ version: 6 });
    await slow.reply(allDocs({ version: 7 }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    getBooking.mockResolvedValue(allDocs({ version: 7 }));
    await answer.fail(refuse(409, "version_conflict"));
    expect(await screen.findByText(/so KYC was not verified/)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("retries on the version the admin confirmed when sending failed and a newer one shows", async () => {
    const user = userEvent.setup();
    popup();
    await show(allDocs());
    const slow = later<ApiBookingDetail>();
    const answer = later<ApiBookingDetail>();
    getBooking.mockReturnValueOnce(slow.promise);
    verifyBookingKyc.mockReturnValueOnce(answer.promise).mockRejectedValueOnce(refuse(409, "version_conflict"));
    await user.click(previewButton("PAN Card"));
    await user.click(verifyButton());
    await user.click(confirm());
    await slow.reply(allDocs({ version: 7 }));
    await answer.fail(new TypeError("Failed to fetch"));
    getBooking.mockResolvedValue(allDocs({ version: 7 }));
    await user.click(confirm());
    expect(verifyBookingKyc.mock.calls[1][2]).toMatchObject({ version: 6 });
    expect(await screen.findByText(/so KYC was not verified/)).toBeInTheDocument();
  });

  it("doesn't approve a document that finished uploading behind the open dialog", async () => {
    const user = userEvent.setup();
    const review = (o: Partial<ApiBookingDetail> = {}) =>
      booking({ status: "pending_kyc_review", version: 3, documents: documents(TYPES), ...o });
    await show(review());
    const upload = later<ApiBookingDetail>();
    uploadBookingDocument.mockReturnValue(upload.promise);
    await chooseAndUpload(user, "PAN Card");
    await user.click(screen.getByRole("button", { name: "Approve" }));
    await upload.reply(review({ version: 4 }));
    approveBooking.mockRejectedValue(refuse(409, "version_conflict"));
    getBooking.mockResolvedValue(review({ version: 4 }));
    await user.click(screen.getByRole("button", { name: "Confirm Approve" }));
    expect(approveBooking.mock.calls[0][2]).toMatchObject({ version: 3 });
    expect(await screen.findByText(/already updated elsewhere/)).toBeInTheDocument();
  });

  it("does the same when a token refresh reloads the page", async () => {
    const user = userEvent.setup();
    const { refreshToken } = await show(allDocs());
    await user.click(verifyButton());
    getBooking.mockResolvedValue(allDocs({ version: 7 }));
    refreshToken();
    expect(await screen.findByText(CHANGED)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the dialog and its note through a token refresh that changes nothing", async () => {
    const user = userEvent.setup();
    const { refreshToken } = await show(allDocs());
    await user.click(verifyButton());
    await user.type(screen.getByLabelText("Note for the record (optional)"), "seen");
    refreshToken();
    await waitFor(() => expect(getBooking).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("heading", { name: "BKG-1" })).toBeInTheDocument();
    expect(screen.getByLabelText("Note for the record (optional)")).toHaveValue("seen");
    expect(screen.queryByText(CHANGED)).not.toBeInTheDocument();
  });

  it("protects approving a website booking the same way", async () => {
    const user = userEvent.setup();
    popup();
    const review = (o: Partial<ApiBookingDetail> = {}) =>
      booking({ status: "pending_kyc_review", version: 3, documents: documents(TYPES), ...o });
    await show(review());
    const slow = later<ApiBookingDetail>();
    getBooking.mockReturnValueOnce(slow.promise);
    await user.click(previewButton("PAN Card"));
    await user.click(screen.getByRole("button", { name: "Approve" }));
    await slow.reply(review({ version: 4 }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText(CHANGED)).toBeInTheDocument();
    approveBooking.mockResolvedValue(review({ version: 5, status: "booked", kyc_status: "verified" }));
    await user.click(screen.getByRole("button", { name: "Approve" }));
    await user.click(screen.getByRole("button", { name: "Confirm Approve" }));
    await screen.findByText(/Booking approved/);
    expect(approveBooking.mock.calls[0][2]).toMatchObject({ version: 4 });
  });

  it("notices that someone else changed the booking too when an upload's reply skips a version", async () => {
    const user = userEvent.setup();
    await show(allDocs());
    uploadBookingDocument.mockResolvedValue(allDocs({ version: 9 }));
    await chooseAndUpload(user, "PAN Card");
    expect(await screen.findByText("PAN Card uploaded.")).toBeInTheDocument();
    expect(screen.getByText(CHANGED)).toBeInTheDocument();
  });

  it.each([
    [7, false],
    [9, true],
  ])("notices it in a saved upload's reload as well (v%s)", async (version, changed) => {
    const user = userEvent.setup();
    await show(allDocs());
    uploadBookingDocument.mockRejectedValue(refuse(503, "document_saved_refresh_failed"));
    getBooking.mockResolvedValue(allDocs({ version }));
    await chooseAndUpload(user, "PAN Card");
    await screen.findByText("PAN Card uploaded.");
    expect(screen.queryAllByText(CHANGED)).toHaveLength(changed ? 1 : 0);
  });
});

describe("BookingDetailPage - replies arriving out of order", () => {
  it("keeps an upload's booking when the reload after a refused verification arrives later", async () => {
    const user = userEvent.setup();
    await show(allDocs({ version: 8 }));
    const slow = later<ApiBookingDetail>();
    verifyBookingKyc.mockRejectedValue(refuse(409, "version_conflict"));
    await user.upload(chooser("PAN Card"), image());
    await user.click(screen.getByRole("button", { name: "Verify KYC" }));
    getBooking.mockReturnValueOnce(slow.promise);
    await user.click(screen.getByRole("button", { name: "Confirm Verified" }));
    uploadBookingDocument.mockResolvedValue(allDocs({ version: 10 }));
    await user.click(uploadButton("PAN Card"));
    expect(await screen.findByText("v10")).toBeInTheDocument();
    await slow.reply(allDocs({ version: 9 }));
    expect(screen.getByText("v10")).toBeInTheDocument();
    expect(screen.queryByText("v9")).not.toBeInTheDocument();
  });

  it("keeps the newer of two loads, whichever arrives last", async () => {
    const user = userEvent.setup();
    popup();
    await show(allDocs({ payment_schedule: [milestone()] }));
    const first = later<ApiBookingDetail>();
    const second = later<ApiBookingDetail>();
    getBooking.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    await user.click(previewButton("PAN Card"));
    await user.click(previewButton("Cancelled Cheque"));
    await second.reply(allDocs({ payment_schedule: [paid()] }));
    await first.reply(allDocs({ payment_schedule: [milestone()] }));
    expect(screen.queryByRole("button", { name: "Record Payment" })).not.toBeInTheDocument();
  });

  it("never goes back a version, even for a later load (a lagging server)", async () => {
    const user = userEvent.setup();
    popup();
    await show(allDocs({ version: 6 }));
    getBooking.mockResolvedValue(allDocs({ version: 5, documents: documents() }));
    await user.click(previewButton("PAN Card"));
    await waitFor(() => expect(getBooking).toHaveBeenCalledTimes(2));
    expect(screen.getByText("v6")).toBeInTheDocument();
    expect(screen.queryByText("Missing")).not.toBeInTheDocument();
    expect(screen.queryByText(CHANGED)).not.toBeInTheDocument();
  });

  it("keeps a recorded instalment when an earlier preview arrives later", async () => {
    const user = userEvent.setup();
    popup();
    await show(allDocs({ payment_schedule: [milestone()] }));
    const slow = later<ApiBookingDetail>();
    getBooking.mockReturnValueOnce(slow.promise);
    recordInstallmentPayment.mockResolvedValue(allDocs({ payment_schedule: [paid()] }));
    await user.click(previewButton("PAN Card"));
    await recordInstalment(user);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Record Payment" })).not.toBeInTheDocument());
    await slow.reply(allDocs({ payment_schedule: [milestone()] }));
    expect(screen.queryByRole("button", { name: "Record Payment" })).not.toBeInTheDocument();
    expect(screen.queryByText(CHANGED)).not.toBeInTheDocument();
  });

  it("warns when an instalment's reply shows the documents changed elsewhere", async () => {
    const user = userEvent.setup();
    await show(allDocs({ payment_schedule: [milestone()] }));
    recordInstallmentPayment.mockResolvedValue(allDocs({ version: 7, payment_schedule: [paid()] }));
    await recordInstalment(user);
    expect(await screen.findByText(CHANGED)).toBeInTheDocument();
  });

  it("reloads when an instalment and an upload cross, so neither is lost", async () => {
    const user = userEvent.setup();
    await show(allDocs({ payment_schedule: [milestone()] }));
    const upload = later<ApiBookingDetail>();
    const record = later<ApiBookingDetail>();
    uploadBookingDocument.mockReturnValue(upload.promise);
    recordInstallmentPayment.mockReturnValue(record.promise);
    await chooseAndUpload(user, "PAN Card");
    await recordInstalment(user);
    await upload.reply(allDocs({ version: 7, payment_schedule: [milestone()] }));
    getBooking.mockResolvedValue(allDocs({ version: 7, payment_schedule: [paid()] }));
    // This reply was read before the upload was saved.
    await record.reply(allDocs({ version: 6, payment_schedule: [paid()] }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Record Payment" })).not.toBeInTheDocument());
    expect(screen.getByText("v7")).toBeInTheDocument();
  });

  it("says the page may be out of date when that reload fails, until one succeeds", async () => {
    const user = userEvent.setup();
    popup();
    await show(allDocs({ payment_schedule: [milestone()] }));
    const upload = later<ApiBookingDetail>();
    const record = later<ApiBookingDetail>();
    uploadBookingDocument.mockReturnValue(upload.promise);
    recordInstallmentPayment.mockReturnValue(record.promise);
    await chooseAndUpload(user, "PAN Card");
    await recordInstalment(user);
    await upload.reply(allDocs({ version: 7, payment_schedule: [milestone()] }));
    getBooking.mockRejectedValueOnce(new ApiError(500, "down"));
    await record.reply(allDocs({ version: 6, payment_schedule: [paid()] }));
    expect(await screen.findByText(/latest details of this booking could not be loaded/)).toBeInTheDocument();
    getBooking.mockResolvedValue(allDocs({ version: 7, payment_schedule: [paid()] }));
    await user.click(previewButton("PAN Card"));
    await waitFor(() => expect(screen.queryByText(/latest details of this booking could not be loaded/)).not.toBeInTheDocument());
  });

  it("shows an upload that finishes while the page is reloading, and ignores that reload's failure", async () => {
    const user = userEvent.setup();
    const { refreshToken } = await show(allDocs());
    const upload = later<ApiBookingDetail>();
    const reload = later<ApiBookingDetail>();
    uploadBookingDocument.mockReturnValue(upload.promise);
    await chooseAndUpload(user, "PAN Card");
    getBooking.mockReturnValueOnce(reload.promise);
    refreshToken();
    expect(await screen.findByText("Loading booking...")).toBeInTheDocument();
    await upload.reply(allDocs({ version: 7 }));
    expect(screen.getByText("PAN Card uploaded.")).toBeInTheDocument();
    await reload.fail(new ApiError(500, "down"));
    expect(screen.getByText("v7")).toBeInTheDocument();
    expect(screen.queryByText("down")).not.toBeInTheDocument();
  });

  it("can still load the page again after a failure", async () => {
    const user = userEvent.setup();
    getBooking.mockRejectedValueOnce(new ApiError(500, "down"));
    render(page());
    expect(await screen.findByText("down")).toBeInTheDocument();
    getBooking.mockResolvedValue(allDocs());
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "BKG-1" })).toBeInTheDocument();
  });
});

describe("BookingDetailPage - moving to another booking", () => {
  const next = (o: Partial<ApiBookingDetail> = {}) => allDocs({ id: "BKG-2", version: 1, applicant_name: "Mrs. Next Buyer", ...o });
  async function goNext(user: ReturnType<typeof userEvent.setup>, data = next()) {
    getBooking.mockResolvedValue(data);
    await user.click(screen.getByRole("link", { name: "Next booking" }));
    await screen.findByRole("heading", { name: "BKG-2" });
  }

  it.each([
    ["Verify KYC", "Confirm Verified", verifyBookingKyc, allDocs()],
    ["Reject", "Confirm Reject", rejectBooking, booking({ status: "pending_kyc_review", documents: documents(TYPES) })],
    ["Approve", "Confirm Approve", approveBooking, booking({ status: "pending_kyc_review", documents: documents(TYPES) })],
    ["Cancel Plot Booked", "Confirm Cancel", cancelBookedPlot, booking()],
  ])("never carries a %s dialog over, sent or not", async (button, confirmName, api, data) => {
    const user = userEvent.setup();
    const answer = later<ApiBookingDetail>();
    api.mockReturnValue(answer.promise);
    await show(data);
    await user.click(screen.getByRole("button", { name: button }));
    await user.type(screen.getByPlaceholderText(/[Nn]ote|Reason/), "for BKG-1");
    await user.click(screen.getByRole("button", { name: confirmName }));
    await goNext(user);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await answer.reply({ ...data, version: 99, unit_number: "OLD" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("v1")).toBeInTheDocument();
    expect(screen.queryByText(/OLD/)).not.toBeInTheDocument();
    expect(screen.queryByText(/KYC verified|approved\.|rejected\.|cancelled\./)).not.toBeInTheDocument();
    expect(api).toHaveBeenCalledTimes(1);

    // The next booking's own dialog works, and starts empty.
    await user.click(screen.getByRole("button", { name: "Verify KYC" }));
    expect(screen.getByRole("button", { name: "Confirm Verified" })).toBeEnabled();
    expect(screen.getByLabelText("Note for the record (optional)")).toHaveValue("");
    expect(screen.getByRole("dialog")).toHaveTextContent("Mrs. Next Buyer");
  });

  it("drops a late refusal of the booking left behind, without reloading anything", async () => {
    const user = userEvent.setup();
    const answer = later<ApiBookingDetail>();
    verifyBookingKyc.mockReturnValue(answer.promise);
    await show(allDocs());
    await user.click(screen.getByRole("button", { name: "Verify KYC" }));
    await user.click(screen.getByRole("button", { name: "Confirm Verified" }));
    await goNext(user);
    const loads = getBooking.mock.calls.length;
    await answer.fail(refuse(409, "version_conflict"));
    expect(screen.queryByText(/not verified/)).not.toBeInTheDocument();
    expect(getBooking).toHaveBeenCalledTimes(loads);
  });

  it("drops a chosen file, its errors and a late upload reply", async () => {
    const user = userEvent.setup();
    const upload = later<ApiBookingDetail>();
    uploadBookingDocument.mockReturnValue(upload.promise);
    await show(allDocs());
    await user.upload(chooser("Applicant Photo"), image("mine.png"));
    await chooseAndUpload(user, "PAN Card");
    await goNext(user);
    expect(screen.queryByText(/Selected:/)).not.toBeInTheDocument();
    for (const b of chooseButtons()) expect(b).toBeEnabled();
    await upload.reply(allDocs({ version: 42 }));
    expect(screen.getByText("v1")).toBeInTheDocument();
    expect(screen.queryByText(/uploaded\./)).not.toBeInTheDocument();
  });

  it("closes a preview window that was still loading", async () => {
    const user = userEvent.setup();
    const opened = popup();
    await show(allDocs());
    const slow = later<ApiBookingDetail>();
    getBooking.mockReturnValueOnce(slow.promise);
    await user.click(previewButton("PAN Card"));
    await goNext(user);
    await slow.reply(allDocs({ version: 7 }));
    expect(opened.close).toHaveBeenCalled();
    expect(opened.location.replace).not.toHaveBeenCalled();
    expect(screen.getByText("v1")).toBeInTheDocument();
  });
});

describe("BookingDetailPage - what the page says about an existing customer", () => {
  const some = documents(["pan_card"]);
  const all = documents(TYPES);
  const REVIEW = "Existing customer. All KYC documents are uploaded: review each one, then verify KYC.";
  const UPLOADED = "Existing customer. All KYC documents are uploaded.";
  const VERIFIED = "Existing customer. KYC is verified.";
  const REOPENS = /sets it back to Pending/;

  it.each<[string, Partial<ApiBookingDetail>, string | null]>([
    ["documents missing", { documents: some, can_verify_kyc: false }, EXISTING],
    ["ready to verify", { documents: all, can_verify_kyc: true }, REVIEW],
    ["ready to verify, uploads closed", { documents: all, can_verify_kyc: true, can_upload_documents: false }, REVIEW],
    ["verified", { documents: all, can_verify_kyc: false, kyc_status: "verified" }, VERIFIED],
    ["all uploaded, not verifiable", { documents: all, can_verify_kyc: false }, UPLOADED],
    ["uploads closed, documents missing", { documents: some, can_verify_kyc: false, can_upload_documents: false }, null],
    ["older backend, documents missing", { documents: some }, EXISTING],
    ["older backend, all uploaded", { documents: all }, UPLOADED],
    ["older backend, verified", { documents: all, kyc_status: "verified" }, VERIFIED],
    ["older backend without uploads either", { documents: some, can_upload_documents: undefined }, null],
  ])("on a booked plot: %s", async (_, overrides, text) => {
    await show(offline(overrides));
    expect(screen.queryByText(DECIDED)).not.toBeInTheDocument();
    if (text) expect(screen.getByText(text)).toBeInTheDocument();
    else expect(screen.queryByText(/^Existing customer\./)).not.toBeInTheDocument();
  });

  it.each(["rejected", "cancelled"] as const)("a %s plot was decided", async (status) => {
    await show(offline({ status, can_upload_documents: false, can_verify_kyc: false, documents: all, kyc_status: "verified" }));
    expect(screen.getByText(DECIDED)).toBeInTheDocument();
    expect(screen.queryByText(/^Existing customer\./)).not.toBeInTheDocument();
  });

  it.each<[string, Partial<ApiBookingDetail>, boolean]>([
    ["verified here", { kyc_status: "verified", can_verify_kyc: false }, true],
    ["not verified yet", { can_verify_kyc: true }, false],
    ["verified, on a backend that can't reopen it", { kyc_status: "verified" }, false],
  ])("promises that replacing reopens KYC only where it does: %s", async (_, overrides, promised) => {
    const user = userEvent.setup();
    await show(offline({ documents: all, ...overrides }));
    await user.upload(chooser("PAN Card"), image());
    expect(screen.queryAllByText(REOPENS)).toHaveLength(promised ? 2 : 0);
    if (!promised) expect(screen.getByText("Uploading saves the document. It does not change the KYC status.")).toBeInTheDocument();
  });

  it("doesn't promise it on a website booking under review", async () => {
    const user = userEvent.setup();
    await show(booking({ status: "pending_kyc_review", kyc_status: "verified", can_upload_documents: true, can_verify_kyc: false, documents: all }));
    await user.upload(chooser("PAN Card"), image());
    expect(screen.queryByText(REOPENS)).not.toBeInTheDocument();
  });

  it("doesn't tell the admin to upload documents that are all there", async () => {
    await show(offline({ documents: all, can_verify_kyc: false }));
    expect(screen.getByRole("button", { name: "Verify KYC" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Verify KYC" })).not.toHaveAttribute("title");
  });
});

describe("BookingDetailPage - a disabled Upload always says why", () => {
  const PDF_ONLY = /PDF is only accepted for a cancelled cheque/;
  const pdf = () => new File(["%PDF"], "scan.pdf", { type: "application/pdf" });

  it("keeps the reason when the stored document is previewed", async () => {
    const user = userEvent.setup({ applyAccept: false });
    popup();
    await show(allDocs());
    await user.upload(chooser("PAN Card"), pdf());
    await user.click(previewButton("PAN Card"));
    await waitFor(() => expect(getBooking).toHaveBeenCalledTimes(2));
    expect(screen.getByText(PDF_ONLY)).toBeInTheDocument();
    expect(uploadButton("PAN Card")).toBeDisabled();
  });

  it("shows it together with a preview that failed", async () => {
    const user = userEvent.setup({ applyAccept: false });
    vi.spyOn(window, "open").mockReturnValue(null);
    await show(allDocs());
    await user.upload(chooser("PAN Card"), pdf());
    await user.click(previewButton("PAN Card"));
    expect(screen.getByText(/Allow pop-ups/)).toBeInTheDocument();
    expect(screen.getByText(PDF_ONLY)).toBeInTheDocument();
  });

  it("drops it with the file, once, when a good one is chosen", async () => {
    const user = userEvent.setup({ applyAccept: false });
    await show(allDocs());
    await user.upload(chooser("PAN Card"), pdf());
    expect(screen.getAllByText(PDF_ONLY)).toHaveLength(1);
    await user.upload(chooser("PAN Card"), image());
    expect(screen.queryByText(PDF_ONLY)).not.toBeInTheDocument();
    expect(uploadButton("PAN Card")).toBeEnabled();
  });

  it("drops a server error when another file is chosen", async () => {
    const user = userEvent.setup();
    await show(allDocs());
    uploadBookingDocument.mockRejectedValue(refuse(415, "unsupported_media_type", "Encrypted PDFs are not supported."));
    await chooseAndUpload(user, "PAN Card");
    expect(await screen.findByText(/Encrypted PDFs/)).toBeInTheDocument();
    await user.upload(chooser("PAN Card"), image("other.png"));
    expect(screen.queryByText(/Encrypted PDFs/)).not.toBeInTheDocument();
  });
});
