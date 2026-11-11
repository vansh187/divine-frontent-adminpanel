import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  type ApiBookingDetail,
  type ApiBookingListItem,
  type BookingListParams,
  type BookingStatus,
} from "../../lib/api";
import { CustomerPaymentPlans } from "./CustomerPaymentPlans";

const listBookings = vi.fn();
const getBooking = vi.fn();
vi.mock("../../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/api")>()),
  listBookings: (...args: unknown[]) => listBookings(...args),
  getBooking: (...args: unknown[]) => getBooking(...args),
}));

const CUSTOMER = "CUST-1";

function item(id: string, overrides: Partial<ApiBookingListItem> = {}): ApiBookingListItem {
  return {
    id,
    customer_id: CUSTOMER,
    customer_name: "Asha",
    project_name: "Suraksha Enclave",
    unit_number: id.replace("BK-", ""),
    amount: 100000,
    status: "booked",
    kyc_status: "verified",
    version: 1,
    created_at: "2026-11-01T10:00:00Z",
    last_activity_at: "2026-11-01T10:00:00Z",
    ...overrides,
  };
}

function detail(id: string, planName: string, labels: string[]): ApiBookingDetail {
  return {
    id,
    status: "booked" as BookingStatus,
    kyc_status: "verified",
    version: 1,
    admin_note: null,
    customer_id: CUSTOMER,
    customer_name: "Asha",
    customer_email: "a@example.com",
    customer_phone: "9999999999",
    project_name: "Suraksha Enclave",
    unit_number: id.replace("BK-", ""),
    amount: 100000,
    payment_id: `PAY-${id}`,
    payment_method: "razorpay",
    payment_status: "captured",
    utr_number: null,
    cheque_number: null,
    documents: [],
    decision_history: [],
    payment_schedule: labels.map((label, i) => ({
      id: `${id}-m${i + 1}`,
      label,
      percent: 50,
      due_days: 0,
      due_date: "2026-11-01",
      amount: 100000,
      status: i === 0 ? "paid" : "upcoming",
      pay_enabled_from: "2026-11-01",
      paid_on: i === 0 ? "2026-11-01T10:00:00Z" : null,
      paid_payment_id: i === 0 ? `PAY-${id}` : null,
    })),
    next_due: null,
    amount_received: 100000,
    payment_plan: { name: planName, short_code: planName.slice(0, 3).toUpperCase(), version: 1 },
    created_at: "2026-11-01T10:00:00Z",
    last_activity_at: "2026-11-01T10:00:00Z",
  };
}

function page(items: ApiBookingListItem[], totalPages = 1) {
  return { items, pagination: { page: 1, page_size: 100, total_items: items.length, total_pages: totalPages } };
}

function renderSection() {
  return render(
    <MemoryRouter>
      <CustomerPaymentPlans accessToken="token" customerId={CUSTOMER} />
    </MemoryRouter>
  );
}

/** The Card (p-5 container) a plot's heading sits in. */
function cardOf(heading: HTMLElement) {
  return heading.closest(".p-5") as HTMLElement;
}

beforeEach(() => {
  listBookings.mockReset();
  getBooking.mockReset();
});

describe("CustomerPaymentPlans", () => {
  it("shows one card per plot, each with its own plan and instalments", async () => {
    listBookings.mockResolvedValue(page([item("BK-A12"), item("BK-B07")]));
    getBooking.mockImplementation(async (_token: string, id: string) =>
      id === "BK-A12" ? detail(id, "Construction Linked", ["A first", "A second"]) : detail(id, "Down Payment", ["B only"])
    );
    renderSection();

    const a = await screen.findByRole("heading", { name: /Plot A12/ });
    const b = screen.getByRole("heading", { name: /Plot B07/ });
    const cardA = cardOf(a);
    const cardB = cardOf(b);
    expect(within(cardA).getByText(/Construction Linked/)).toBeInTheDocument();
    expect(within(cardA).getByText("A second")).toBeInTheDocument();
    expect(within(cardA).queryByText("B only")).not.toBeInTheDocument();
    expect(within(cardB).getByText(/Down Payment/)).toBeInTheDocument();
    expect(within(cardB).getByText("B only")).toBeInTheDocument();
    expect(within(cardB).queryByText("A second")).not.toBeInTheDocument();

    const links = screen.getAllByRole("link", { name: "Open booking" });
    expect(links.map((l) => l.getAttribute("href"))).toEqual(["/admin/bookings/BK-A12", "/admin/bookings/BK-B07"]);
    expect(screen.queryByRole("button", { name: /record payment/i })).not.toBeInTheDocument();
  });

  it("asks for an exact customer filter and keeps only exact matches from the substring search", async () => {
    listBookings.mockResolvedValue(
      page([
        item("BK-1"),
        item("BK-2", { customer_id: "CUST-10" }), // substring match for another customer
        item("BK-3", { customer_id: "XCUST-1" }),
      ])
    );
    getBooking.mockImplementation(async (_t: string, id: string) => detail(id, "Plan", ["Row"]));
    renderSection();

    await screen.findByRole("heading", { name: /Plot 1$/ });
    const params = listBookings.mock.calls[0][1] as BookingListParams;
    expect(params).toMatchObject({ customer_id: CUSTOMER, search: CUSTOMER, page: 1, page_size: 100 });
    expect(getBooking).toHaveBeenCalledTimes(1);
    expect(getBooking).toHaveBeenCalledWith("token", "BK-1");
  });

  it("skips rejected and cancelled bookings", async () => {
    listBookings.mockResolvedValue(
      page([item("BK-1"), item("BK-2", { status: "rejected" }), item("BK-3", { status: "cancelled" })])
    );
    getBooking.mockImplementation(async (_t: string, id: string) => detail(id, "Plan", ["Row"]));
    renderSection();

    await screen.findByRole("heading", { name: /Plot 1$/ });
    expect(screen.queryByRole("heading", { name: /Plot 2|Plot 3/ })).not.toBeInTheDocument();
    expect(getBooking).toHaveBeenCalledTimes(1);
  });

  it("shows a plot under KYC review without its instalments, like the booking page", async () => {
    listBookings.mockResolvedValue(page([item("BK-9", { status: "pending_kyc_review" })]));
    getBooking.mockResolvedValue(detail("BK-9", "Flexi", ["Hidden row"]));
    renderSection();

    expect(await screen.findByText(/under KYC review/)).toBeInTheDocument();
    expect(await screen.findByText(/Flexi/)).toBeInTheDocument();
    expect(screen.queryByText("Hidden row")).not.toBeInTheDocument();
  });

  it("explains when the customer has no active bookings", async () => {
    listBookings.mockResolvedValue(page([]));
    renderSection();
    expect(await screen.findByText(/no active bookings/)).toBeInTheDocument();
    expect(getBooking).not.toHaveBeenCalled();
  });

  it("retries only the plot that failed, with the server's reason, and leaves the others alone", async () => {
    const user = userEvent.setup();
    listBookings.mockResolvedValue(page([item("BK-A"), item("BK-B")]));
    getBooking.mockImplementation(async (_t: string, id: string) => {
      if (id === "BK-B") throw new ApiError(500, "Booking service unavailable");
      return detail(id, "Plan A", ["A row"]);
    });
    renderSection();

    expect(await screen.findByText("Booking service unavailable")).toBeInTheDocument();
    expect(screen.getByText("A row")).toBeInTheDocument();

    getBooking.mockClear();
    getBooking.mockResolvedValue(detail("BK-B", "Plan B", ["B row"]));
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("B row")).toBeInTheDocument();
    expect(getBooking).toHaveBeenCalledTimes(1);
    expect(getBooking).toHaveBeenCalledWith("token", "BK-B");
    expect(listBookings).toHaveBeenCalledTimes(1);
    expect(screen.getByText("A row")).toBeInTheDocument();
  });

  it("uses a generic message for non-API failures", async () => {
    listBookings.mockResolvedValue(page([item("BK-A")]));
    getBooking.mockRejectedValue(new TypeError("Failed to fetch"));
    renderSection();
    expect(await screen.findByText(/could not be loaded/)).toBeInTheDocument();
  });

  it("recovers from a failed bookings list with Try again", async () => {
    const user = userEvent.setup();
    listBookings.mockRejectedValueOnce(new ApiError(503, "Service unavailable"));
    renderSection();
    expect(await screen.findByText("Service unavailable")).toBeInTheDocument();

    listBookings.mockResolvedValue(page([item("BK-1")]));
    getBooking.mockResolvedValue(detail("BK-1", "Plan", ["Recovered row"]));
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Recovered row")).toBeInTheDocument();
  });

  it("warns when the bookings list was cut off", async () => {
    listBookings.mockImplementation(async (_t: string, params: BookingListParams) =>
      page([item(`BK-${params.page}`, { status: "rejected" })], 10)
    );
    renderSection();
    expect(await screen.findByText(/Only some of this customer's bookings could be checked/)).toBeInTheDocument();
    expect(listBookings).toHaveBeenCalledTimes(5);
  });

  it("does not warn when every page was read", async () => {
    listBookings.mockImplementation(async (_t: string, params: BookingListParams) =>
      page(params.page === 1 ? [item("BK-1")] : [item("BK-2")], 2)
    );
    getBooking.mockImplementation(async (_t: string, id: string) => detail(id, "Plan", [`Row ${id}`]));
    renderSection();
    await screen.findByText("Row BK-2");
    expect(screen.queryByText(/Only some/)).not.toBeInTheDocument();
    await waitFor(() => expect(listBookings).toHaveBeenCalledTimes(2));
  });
});
