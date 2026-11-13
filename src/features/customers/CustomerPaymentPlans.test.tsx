import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  type ApiBookingDetail,
  type ApiBookingListItem,
  type ApiCustomerPlot,
  type BookingListParams,
  type BookingStatus,
} from "../../lib/api";
import { localDateISO } from "../../lib/format";
import { CustomerPaymentPlans, comparePlotRows, distinctApplicants } from "./CustomerPaymentPlans";

const listBookings = vi.fn();
const getBooking = vi.fn();
const getCustomerDetail = vi.fn();
const setPlotPaymentTerms = vi.fn();
vi.mock("../../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/api")>()),
  listBookings: (...args: unknown[]) => listBookings(...args),
  getBooking: (...args: unknown[]) => getBooking(...args),
  getCustomerDetail: (...args: unknown[]) => getCustomerDetail(...args),
  setPlotPaymentTerms: (...args: unknown[]) => setPlotPaymentTerms(...args),
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
  getCustomerDetail.mockReset();
  getCustomerDetail.mockResolvedValue({ plots: [] });
  setPlotPaymentTerms.mockReset();
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

function offlinePlot(unit: string, overrides: Partial<ApiCustomerPlot> = {}): ApiCustomerPlot {
  return {
    document_id: `DOC-${unit}`,
    record_type: "offline",
    project_name: "Suraksha Enclave",
    unit_number: unit,
    applicant_name: "Mr. Rohit Mehra",
    payment_plan: { code: "PP1/FPP/10-15-25-25-15-10", short_code: "PP1", name: "Flexible Payment Plan", version: 1 },
    booking_date: "2026-04-18",
    sale_price: null,
    plc: null,
    ifms: null,
    cam: null,
    total: null,
    amount_received: null,
    outstanding: null,
    terms_status: "price_needed",
    terms_editable: true,
    demand_letter_available: false,
    schedule: [],
    ...overrides,
  };
}

describe("CustomerPaymentPlans - offline buyers' plots", () => {
  it("shows an offline buyer's plot with its plan even though there is no website booking", async () => {
    listBookings.mockResolvedValue(page([]));
    getCustomerDetail.mockResolvedValue({ plots: [offlinePlot("D8")] });
    renderSection();

    const card = within(cardOf(await screen.findByText(/Plot D8/)));
    expect(card.getByText("Flexible Payment Plan (PP1) · v1")).toBeInTheDocument();
    expect(card.getByText("Price needed")).toBeInTheDocument();
    expect(card.getByRole("button", { name: "Enter prices" })).toBeInTheDocument();
    expect(card.queryByRole("button", { name: /demand letter/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/no active bookings/)).not.toBeInTheDocument();
  });

  it("lists which plot is on which plan when the customer holds several plots", async () => {
    listBookings.mockResolvedValue(page([]));
    getCustomerDetail.mockResolvedValue({
      plots: [
        offlinePlot("D9", { payment_plan: null, terms_status: "plan_needed" }),
        offlinePlot("D7"),
        offlinePlot("D8", {
          applicant_name: "Mr. Vikas Rao",
          payment_plan: { code: "PP3/FPP/50-25-15-10", short_code: "PP3", name: "Plan 50-25-15-10", version: 1 },
        }),
      ],
    });
    renderSection();

    const table = await screen.findByRole("table", { name: "Plots and payment plans" });
    const rows = within(table).getAllByRole("row").slice(1).map((r) => within(r).getAllByRole("cell").map((c) => c.textContent));
    expect(rows.map((r) => [r[0], r[1], r[3], r[4]])).toEqual([
      ["D7", "Mr. Rohit Mehra", "Flexible Payment Plan (PP1) · v1", "Price needed"],
      ["D8", "Mr. Vikas Rao", "Plan 50-25-15-10 (PP3) · v1", "Price needed"],
      ["D9", "Mr. Rohit Mehra", "Not linked yet", "Plan needed"],
    ]);
    // One email, two applicants: the account is shared, each plot keeps its own applicant.
    expect(screen.getByText(/shared by 2 applicants \(Mr\. Rohit Mehra, Mr\. Vikas Rao\)/)).toBeInTheDocument();
    const d8 = within(cardOf(screen.getByRole("heading", { name: /Plot D8/ })));
    expect(d8.getByText("Mr. Vikas Rao")).toBeInTheDocument();
  });

  it("saves the plot's prices and shows the schedule it gets back", async () => {
    listBookings.mockResolvedValue(page([]));
    getCustomerDetail.mockResolvedValue({ plots: [offlinePlot("D8")] });
    setPlotPaymentTerms.mockResolvedValue(
      offlinePlot("D8", {
        sale_price: 5000000, total: 5000000, amount_received: 500000, outstanding: 4500000,
        terms_status: "complete", demand_letter_available: true,
        schedule: [{ milestone_no: 1, label: "On Booking", percent: 10, due_date: "2026-04-18", amount: 500000, status: "paid" }],
      })
    );
    const user = userEvent.setup();
    renderSection();

    await user.click(await screen.findByRole("button", { name: "Enter prices" }));
    await user.type(screen.getByLabelText("Basic sale price (₹)"), "5000000");
    await user.type(screen.getByLabelText("Amount received to date (₹)"), "500000");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(setPlotPaymentTerms).toHaveBeenCalledWith("token", CUSTOMER, "DOC-D8", {
      payment_plan: "PP1", booking_date: "2026-04-18", sale_price: 5000000, amount_received: 500000,
      // Blank fields are sent as null: saving replaces the plot's terms.
      plc: null, ifms: null, cam: null,
    });
    expect(await screen.findByRole("button", { name: "Download demand letter" })).toBeInTheDocument();
    expect(screen.getByText("Schedule ready")).toBeInTheDocument();
    expect(screen.getByText("On Booking")).toBeInTheDocument();
  });

  it("explains a refused save in plain words", async () => {
    listBookings.mockResolvedValue(page([]));
    getCustomerDetail.mockResolvedValue({ plots: [offlinePlot("D8")] });
    setPlotPaymentTerms.mockRejectedValue(new ApiError(400, "sale_price_required", "sale_price_required"));
    const user = userEvent.setup();
    renderSection();

    await user.click(await screen.findByRole("button", { name: "Enter prices" }));
    await user.type(screen.getByLabelText("Amount received to date (₹)"), "1000");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Enter the sale price before PLC, IFMS, CAM or the amount received."
    );
  });

  it("still works on a backend without the customer endpoint", async () => {
    listBookings.mockResolvedValue(page([]));
    getCustomerDetail.mockRejectedValue(new ApiError(404, "Not Found"));
    renderSection();
    expect(await screen.findByText(/no active bookings/)).toBeInTheDocument();
  });
});

describe("CustomerPaymentPlans - partial failures, order and names", () => {
  it("still shows the offline plots when the bookings list fails, and retries just the bookings", async () => {
    const user = userEvent.setup();
    listBookings.mockRejectedValueOnce(new ApiError(500, "internal_error"));
    getCustomerDetail.mockResolvedValue({ plots: [offlinePlot("D8")] });
    renderSection();

    expect(await screen.findByRole("heading", { name: /Plot D8/ })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("internal_error");
    expect(screen.getByRole("button", { name: "Enter prices" })).toBeInTheDocument();

    listBookings.mockResolvedValue(page([item("BK-1")]));
    getBooking.mockResolvedValue(detail("BK-1", "Plan", ["Recovered row"]));
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Recovered row")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(getCustomerDetail).toHaveBeenCalledTimes(1);
  });

  it("offers a retry when the offline plots fail, without claiming there is no plan", async () => {
    const user = userEvent.setup();
    listBookings.mockResolvedValue(page([]));
    getCustomerDetail.mockRejectedValueOnce(new ApiError(500, "internal_error"));
    renderSection();

    expect(await screen.findByRole("alert")).toHaveTextContent("internal_error");
    expect(screen.queryByText(/no active bookings/)).not.toBeInTheDocument();

    getCustomerDetail.mockResolvedValue({ plots: [offlinePlot("D8")] });
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: /Plot D8/ })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(listBookings).toHaveBeenCalledTimes(1);
  });

  it("sorts plots naturally within each project", () => {
    const row = (project: string, plot: string) => ({ project, plot });
    const rows = [row("Suraksha Enclave", "B-2"), row("Suraksha Enclave", "A-100"), row("Suraksha Enclave", "A-9"),
      row("Suraksha Enclave", "A-10"), row("OPS Divine Greens", "Z-1")];
    expect(rows.sort(comparePlotRows).map((r) => r.plot)).toEqual(["Z-1", "A-9", "A-10", "A-100", "B-2"]);
  });

  it("treats the same applicant with or without a salutation as one person", () => {
    expect(distinctApplicants(["Mr. Sunil Kumar", "Sunil  Kumar", "sunil kumar", null, " "])).toEqual(["Mr. Sunil Kumar"]);
    expect(distinctApplicants(["Mrs. Asha Rao", "Asha Rao", "Mr. Vikas Rao"])).toEqual(["Mrs. Asha Rao", "Mr. Vikas Rao"]);
    // Only a leading salutation is dropped: different people stay different.
    expect(distinctApplicants(["Dr Mira Shah", "Mira Shahi"])).toEqual(["Dr Mira Shah", "Mira Shahi"]);
  });

  it("does not call one buyer 'shared by 2 applicants' because two sources spell the name differently", async () => {
    listBookings.mockResolvedValue(page([item("BK-1", { customer_name: "Rohit Mehra" })]));
    getBooking.mockResolvedValue({ ...detail("BK-1", "Plan", ["Row"]), customer_name: "Rohit Mehra" });
    getCustomerDetail.mockResolvedValue({ plots: [offlinePlot("D8")] }); // applicant "Mr. Rohit Mehra"
    renderSection();

    expect(await screen.findByRole("table", { name: "Plots and payment plans" })).toBeInTheDocument();
    expect(screen.queryByText(/shared by/)).not.toBeInTheDocument();
  });

  it("warns before saving a priced plot without its sale price, and sends the cleared prices as null", async () => {
    const priced = offlinePlot("D8", {
      sale_price: 5000000, plc: 100000, total: 5100000, amount_received: 500000, outstanding: 4600000,
      terms_status: "complete", demand_letter_available: true,
    });
    listBookings.mockResolvedValue(page([]));
    getCustomerDetail.mockResolvedValue({ plots: [priced] });
    setPlotPaymentTerms.mockResolvedValue(offlinePlot("D8"));
    const user = userEvent.setup();
    renderSection();

    await user.click(await screen.findByRole("button", { name: "Edit terms" }));
    expect(screen.queryByText(/removes this plot's prices/)).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText("Basic sale price (₹)"));
    await user.clear(screen.getByLabelText("PLC (₹)"));
    await user.clear(screen.getByLabelText("Amount received to date (₹)"));
    expect(screen.getByText(/removes this plot's prices, its instalments and its demand letter/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(setPlotPaymentTerms).toHaveBeenCalledWith("token", CUSTOMER, "DOC-D8", {
      payment_plan: "PP1", booking_date: "2026-04-18",
      sale_price: null, plc: null, ifms: null, cam: null, amount_received: null,
    });
  });

  it("caps the booking date at the admin's local today, not the UTC date", async () => {
    listBookings.mockResolvedValue(page([]));
    getCustomerDetail.mockResolvedValue({ plots: [offlinePlot("D8")] });
    const user = userEvent.setup();
    renderSection();
    await user.click(await screen.findByRole("button", { name: "Enter prices" }));
    expect(screen.getByLabelText("Booking date")).toHaveAttribute("max", localDateISO());
  });
});

describe("CustomerPaymentPlans - applicants", () => {
  it("shows the plot's applicant and every co-applicant", async () => {
    listBookings.mockResolvedValue(page([]));
    getCustomerDetail.mockResolvedValue({
      plots: [offlinePlot("D8", { applicant_name: "Mr. Vikas Rao", co_applicant_names: ["Mrs. Meena Rao", "Mr. Ajay Rao"] })],
    });
    renderSection();
    const card = within(cardOf(await screen.findByRole("heading", { name: /Plot D8/ })));
    expect(card.getByText("Mr. Vikas Rao")).toBeInTheDocument();
    expect(card.getByText("Mrs. Meena Rao, Mr. Ajay Rao")).toBeInTheDocument();
    expect(card.getByText(/Co-applicants:/)).toBeInTheDocument();
  });
});
