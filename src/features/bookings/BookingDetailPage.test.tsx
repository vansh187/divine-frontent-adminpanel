import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, type ApiBookingDetail } from "../../lib/api";
import { BookingDetailPage } from "./BookingDetailPage";

const getBooking = vi.fn();
const uploadBookingDocument = vi.fn();
const cancelBookedPlot = vi.fn();
vi.mock("../../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/api")>()),
  getBooking: (...args: unknown[]) => getBooking(...args),
  uploadBookingDocument: (...args: unknown[]) => uploadBookingDocument(...args),
  cancelBookedPlot: (...args: unknown[]) => cancelBookedPlot(...args),
}));
vi.mock("../../lib/auth", () => ({ useAuth: () => ({ accessToken: "token" }) }));

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

async function show(data: ApiBookingDetail) {
  getBooking.mockResolvedValue(data);
  render(
    <MemoryRouter initialEntries={["/admin/bookings/BKG-1"]}>
      <Routes>
        <Route path="/admin/bookings/:id" element={<BookingDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
  await screen.findByRole("heading", { name: "BKG-1" });
}

const DECIDED = /already been decided/;
const valueOf = (label: string) => screen.getByText(label).nextElementSibling;

beforeEach(() => {
  getBooking.mockReset();
  uploadBookingDocument.mockReset();
  cancelBookedPlot.mockReset();
});

describe("BookingDetailPage - who can upload KYC documents", () => {
  it("accepts an offline buyer's documents although the booking is already booked", async () => {
    await show(offline());
    expect(screen.getAllByRole("button", { name: "Choose file" })).toHaveLength(5);
    expect(screen.getByLabelText("Choose PAN Card file")).toBeEnabled();
    expect(screen.queryByText(DECIDED)).not.toBeInTheDocument();
    expect(screen.getByText(/Uploading does not change its KYC status/)).toBeInTheDocument();
  });

  it("uploads one, without talking about approving KYC", async () => {
    const user = userEvent.setup();
    await show(offline());
    uploadBookingDocument.mockResolvedValue(
      offline({ version: 2, documents: [{ document_type: "pan_card", label: "PAN Card", uploaded: true, preview_url: null, preview_url_expires_in: null, uploaded_at: null }] })
    );
    const file = new File(["x"], "pan.png", { type: "image/png" });
    await user.upload(screen.getByLabelText("Choose PAN Card file"), file);
    await user.click(screen.getByRole("button", { name: "Upload document" }));
    await waitFor(() => expect(uploadBookingDocument).toHaveBeenCalledTimes(1));
    expect(uploadBookingDocument.mock.calls[0].slice(1, 5)).toEqual(["BKG-1", "pan_card", file, 1]);
    expect(await screen.findByText("PAN Card uploaded.")).toBeInTheDocument();
  });

  it("follows the server when it says no, whatever the status", async () => {
    await show(booking({ status: "pending_kyc_review", can_upload_documents: false }));
    expect(screen.queryByRole("button", { name: "Choose file" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Choose PAN Card file")).toBeDisabled();
    expect(screen.getByText(/can be viewed but no longer changed/)).toBeInTheDocument();
  });

  it("goes by the status on an older backend", async () => {
    await show(booking({ status: "pending_kyc_review" }));
    expect(screen.getAllByRole("button", { name: "Choose file" })).toHaveLength(5);
  });

  it("keeps a decided website booking read-only", async () => {
    await show(booking({ is_offline: false, can_upload_documents: false }));
    expect(screen.getByText(DECIDED)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Choose file" })).not.toBeInTheDocument();
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
