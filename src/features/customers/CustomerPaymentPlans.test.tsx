import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  type ApiBookingDetail,
  type ApiBookingListItem,
  type ApiCustomerPlot,
  type ApiPaymentPlan,
  type BookingListParams,
  type BookingStatus,
} from "../../lib/api";
import { localDateISO } from "../../lib/format";
import { distinctApplicants } from "../../lib/applicants";
import { CustomerPaymentPlans, comparePlotRows } from "./CustomerPaymentPlans";

const listBookings = vi.fn();
const getBooking = vi.fn();
const getCustomerDetail = vi.fn();
const setPlotPaymentTerms = vi.fn();
const downloadPlotDemandLetter = vi.fn();
const setPlotDemandLetterOnWebsite = vi.fn();
const listAdminPaymentPlans = vi.fn();
vi.mock("../../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/api")>()),
  listAdminPaymentPlans: (...args: unknown[]) => listAdminPaymentPlans(...args),
  listBookings: (...args: unknown[]) => listBookings(...args),
  getBooking: (...args: unknown[]) => getBooking(...args),
  getCustomerDetail: (...args: unknown[]) => getCustomerDetail(...args),
  setPlotPaymentTerms: (...args: unknown[]) => setPlotPaymentTerms(...args),
  downloadPlotDemandLetter: (...args: unknown[]) => downloadPlotDemandLetter(...args),
  setPlotDemandLetterOnWebsite: (...args: unknown[]) => setPlotDemandLetterOnWebsite(...args),
}));
const saveBlob = vi.fn();
vi.mock("../../lib/download", () => ({ saveBlob: (...args: unknown[]) => saveBlob(...args) }));

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
  downloadPlotDemandLetter.mockReset();
  setPlotDemandLetterOnWebsite.mockReset();
  listAdminPaymentPlans.mockReset();
  saveBlob.mockReset();
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
      payment_plan: "PP1/FPP/10-15-25-25-15-10", booking_date: "2026-04-18", sale_price: 5000000, amount_received: 500000,
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
    expect(distinctApplicants(["Mr. Rohit Mehra", "Rohit  Mehra", "rohit mehra", null, " "])).toEqual(["Mr. Rohit Mehra"]);
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

    await user.click(await screen.findByRole("button", { name: "Edit prices" }));
    expect(screen.queryByText(/removes this plot's prices/)).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText("Basic sale price (₹)"));
    await user.clear(screen.getByLabelText("PLC (₹)"));
    await user.clear(screen.getByLabelText("Amount received to date (₹)"));
    expect(screen.getByText(/removes this plot's prices, its instalments and its demand letter/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(setPlotPaymentTerms).toHaveBeenCalledWith("token", CUSTOMER, "DOC-D8", {
      payment_plan: "PP1/FPP/10-15-25-25-15-10", booking_date: "2026-04-18",
      sale_price: null, plc: null, ifms: null, cam: null, amount_received: null,
    });
  });

  it("shows the demand letter before downloading it, and downloads the same file", async () => {
    URL.createObjectURL = vi.fn(() => "blob:letter");
    URL.revokeObjectURL = vi.fn();
    const letter = new Blob(["%PDF-1.4"], { type: "application/pdf" });
    listBookings.mockResolvedValue(page([]));
    getCustomerDetail.mockResolvedValue({
      plots: [offlinePlot("D8", { sale_price: 5000000, total: 5000000, terms_status: "complete", demand_letter_available: true })],
    });
    downloadPlotDemandLetter.mockResolvedValue({ blob: letter, filename: "DL-D8.pdf" });
    const user = userEvent.setup();
    renderSection();

    await user.click(await screen.findByRole("button", { name: "View demand letter" }));
    const dialog = within(screen.getByRole("dialog", { name: "Demand Letter" }));
    expect(await dialog.findByTitle("Demand Letter")).toHaveAttribute("src", "blob:letter");
    expect(downloadPlotDemandLetter).toHaveBeenCalledWith("token", CUSTOMER, "DOC-D8");

    await user.click(dialog.getByRole("button", { name: "Download" }));
    expect(saveBlob).toHaveBeenCalledWith(letter, "DL-D8.pdf");
    expect(downloadPlotDemandLetter).toHaveBeenCalledTimes(1);

    await user.click(dialog.getAllByRole("button", { name: "Close" })[0]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:letter");
  });

  it("explains in the preview when the demand letter can't be opened", async () => {
    listBookings.mockResolvedValue(page([]));
    getCustomerDetail.mockResolvedValue({
      plots: [offlinePlot("D8", { sale_price: 5000000, total: 5000000, terms_status: "complete", demand_letter_available: true })],
    });
    downloadPlotDemandLetter.mockRejectedValue(new ApiError(409, "payment_details_pending", "payment_details_pending"));
    const user = userEvent.setup();
    renderSection();

    await user.click(await screen.findByRole("button", { name: "View demand letter" }));
    const dialog = within(screen.getByRole("dialog", { name: "Demand Letter" }));
    expect(await dialog.findByRole("alert")).toHaveTextContent("Enter this plot's prices first.");
    expect(dialog.getByRole("button", { name: "Download" })).toBeDisabled();
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

describe("CustomerPaymentPlans - Edit terms changes the plan", () => {
  const plan = (code: string, short: string, name: string, overrides: Partial<ApiPaymentPlan> = {}): ApiPaymentPlan => ({
    code, short_code: short, name, description: null, project_id: null, version: 1, is_active: true, valid: true,
    instalments: [
      { seq: 1, label: "On booking", percent: 10, due_trigger: "booking", due_days: 0, due_text: "", charge_head: null },
      { seq: 2, label: "Within 90 days", percent: 90, due_trigger: "booking", due_days: 90, due_text: "", charge_head: null },
    ],
    ...overrides,
  });
  const priced = () =>
    offlinePlot("D8", {
      sale_price: 5000000, plc: 100000, ifms: 20000, cam: null, total: 5120000,
      amount_received: 500000, outstanding: 4620000, terms_status: "complete", demand_letter_available: true,
    });

  it("lists every plan the company offers and moves the plot to the chosen one, keeping its prices", async () => {
    listAdminPaymentPlans.mockResolvedValue({
      count: 5,
      plans: [
        plan("PP1/FPP/10-15-25-25-15-10", "PP1", "Flexible Payment Plan"),
        plan("PP2/CLP", "PP2", "Construction Linked", { version: 2 }),
        plan("PP2/CLP", "PP2", "Construction Linked (old)", { version: 1 }),
        plan("PP3/DPP", "PP3", "Down Payment", { is_active: false }),
        plan("PP4/BROKEN", "PP4", "Broken", { valid: false }),
      ],
    });
    listBookings.mockResolvedValue(page([]));
    getCustomerDetail.mockResolvedValue({ plots: [priced()] });
    setPlotPaymentTerms.mockResolvedValue({ ...priced(), payment_plan: { code: "PP2/CLP", short_code: "PP2", name: "Construction Linked", version: 2 } });
    const user = userEvent.setup();
    renderSection();

    await user.click(await screen.findByRole("button", { name: "Edit terms" }));
    const form = within(screen.getByRole("form", { name: "Change payment plan" }));
    const radios = await form.findAllByRole("radio");
    // Newest active, valid version of each code only; no price fields.
    expect(radios).toHaveLength(2);
    expect(radios[0]).toHaveAccessibleName(/^PP1 — Flexible Payment Plan/);
    expect(radios[1]).toHaveAccessibleName(/^PP2 — Construction Linked(?! \(old\))/);
    expect(form.queryByLabelText("Basic sale price (₹)")).not.toBeInTheDocument();
    expect(radios[0]).toBeChecked();
    expect(form.getByText("Current plan")).toBeInTheDocument();
    expect(form.getByRole("button", { name: "Change plan" })).toBeDisabled();

    await user.click(radios[1]);
    expect(form.getByText(/rebuilt from PP2 — Construction Linked/)).toBeInTheDocument();
    await user.click(form.getByRole("button", { name: "Change plan" }));

    expect(setPlotPaymentTerms).toHaveBeenCalledWith("token", CUSTOMER, "DOC-D8", {
      payment_plan: "PP2/CLP", booking_date: "2026-04-18",
      sale_price: 5000000, plc: 100000, ifms: 20000, cam: null, amount_received: 500000,
    });
    expect(await screen.findByText(/Construction Linked \(PP2\) · v2/)).toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "Change payment plan" })).not.toBeInTheDocument();
  });

  it("explains a refused plan change and offers a retry when the plans can't be loaded", async () => {
    listAdminPaymentPlans.mockRejectedValueOnce(new ApiError(500, "Plans unavailable"));
    listBookings.mockResolvedValue(page([]));
    getCustomerDetail.mockResolvedValue({ plots: [priced()] });
    setPlotPaymentTerms.mockRejectedValue(new ApiError(409, "schedule_has_payments", "schedule_has_payments"));
    const user = userEvent.setup();
    renderSection();

    await user.click(await screen.findByRole("button", { name: "Edit terms" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Plans unavailable");

    listAdminPaymentPlans.mockResolvedValue({ count: 2, plans: [plan("PP1/FPP/10-15-25-25-15-10", "PP1", "Flexible"), plan("PP2/CLP", "PP2", "CLP")] });
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await user.click(await screen.findByRole("radio", { name: /PP2 — CLP/ }));
    await user.click(screen.getByRole("button", { name: "Change plan" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("already paid online");
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

describe("CustomerPaymentPlans - part-paid instalments", () => {
  it("shows each instalment's amount, what is paid and the balance (amount - paid)", async () => {
    listBookings.mockResolvedValue(page([]));
    getCustomerDetail.mockResolvedValue({
      plots: [
        offlinePlot("D8", {
          terms_status: "complete", demand_letter_available: true, total: 2627460,
          amount_received: 1574870, outstanding: 1052590,
          schedule: [
            { milestone_no: 3, label: "Within 90 days of booking", percent: 25, due_date: "2026-08-03",
              amount: 656865, amount_paid: 656865, balance: 0, status: "paid" },
            { milestone_no: 4, label: "Within 180 days of booking", percent: 25, due_date: "2026-11-01",
              amount: 656865, amount_paid: 261140, balance: 395725, status: "overdue" },
          ],
        }),
      ],
    });
    renderSection();
    const row = (await screen.findByText("Within 180 days of booking")).closest("tr") as HTMLElement;
    const cells = within(row).getAllByRole("cell").map((c) => c.textContent);
    expect(cells.slice(3, 6)).toEqual(["₹6,56,865", "₹2,61,140", "₹3,95,725"]);
    const paidRow = screen.getByText("Within 90 days of booking").closest("tr") as HTMLElement;
    expect(within(paidRow).getAllByRole("cell").map((c) => c.textContent).slice(3, 6)).toEqual(
      ["₹6,56,865", "₹6,56,865", "₹0"]
    );
  });
});

describe("CustomerPaymentPlans - an offline plot that has a booking", () => {
  it("shows the plot once, linked to its booking", async () => {
    listBookings.mockResolvedValue(page([item("BK-D8")]));
    getBooking.mockResolvedValue(detail("BK-D8", "Plan", ["Row BK-D8"]));
    getCustomerDetail.mockResolvedValue({ plots: [offlinePlot("D8", { booking_id: "BK-D8" })] });
    renderSection();
    expect(await screen.findByRole("link", { name: "Open booking" })).toHaveAttribute("href", "/admin/bookings/BK-D8");
    expect(screen.getAllByRole("heading", { name: /Plot D8/ })).toHaveLength(1);
    expect(screen.queryByText("Row BK-D8")).not.toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "Plots and payment plans" })).not.toBeInTheDocument();
  });

  it("still shows the customer's other bookings", async () => {
    listBookings.mockResolvedValue(page([item("BK-D8"), item("BK-D9")]));
    getBooking.mockImplementation(async (_t: string, id: string) => detail(id, "Plan", [`Row ${id}`]));
    getCustomerDetail.mockResolvedValue({ plots: [offlinePlot("D8", { booking_id: "BK-D8" })] });
    renderSection();
    expect(await screen.findByText("Row BK-D9")).toBeInTheDocument();
    expect(screen.queryByText("Row BK-D8")).not.toBeInTheDocument();
  });
});

describe("CustomerPaymentPlans - a payment awaiting confirmation on an offline plot", () => {
  const plot = (overrides: Partial<ApiCustomerPlot> = {}) =>
    offlinePlot("D8", {
      booking_id: "BK-D8", sale_price: 5000000, total: 5000000, amount_received: 500000, outstanding: 4500000,
      terms_status: "complete",
      schedule: [
        { milestone_no: 1, label: "On Booking", percent: 10, due_date: "2026-04-18", amount: 500000, status: "paid" },
        { milestone_no: 2, label: "Within 45 days", percent: 90, due_date: "2026-06-02", amount: 4500000, status: "overdue" },
      ],
      ...overrides,
    });
  const bookingWith = (status: "pending_review" | "overdue") => {
    const d = detail("BK-D8", "Plan", ["On Booking", "Within 45 days"]);
    d.payment_schedule[1] = { ...d.payment_schedule[1], id: "DOC-D8-m2", amount: 4500000, status };
    return d;
  };

  beforeEach(() => {
    listBookings.mockResolvedValue(page([item("BK-D8")]));
    getCustomerDetail.mockResolvedValue({ plots: [plot()] });
  });

  it("says a payment is waiting, instead of showing the instalment as overdue", async () => {
    getBooking.mockResolvedValue(bookingWith("pending_review"));
    renderSection();
    expect(await screen.findByText(/the customer submitted a payment for/)).toHaveTextContent("Within 45 days (₹45,00,000)");
    expect(screen.getByText("Awaiting confirmation")).toBeInTheDocument();
    expect(screen.queryByText("Overdue")).not.toBeInTheDocument();
  });

  it("shows nothing extra when no payment is waiting", async () => {
    getBooking.mockResolvedValue(bookingWith("overdue"));
    renderSection();
    expect(await screen.findByText("Overdue")).toBeInTheDocument();
    expect(screen.queryByText(/submitted a payment/)).not.toBeInTheDocument();
  });

  it("says so, with a retry, when the booking couldn't be checked", async () => {
    getBooking.mockRejectedValueOnce(new ApiError(500, "down"));
    getBooking.mockResolvedValue(bookingWith("pending_review"));
    const user = userEvent.setup();
    renderSection();
    expect(await screen.findByText(/Couldn't check whether a payment/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText(/the customer submitted a payment for/)).toBeInTheDocument();
    expect(screen.queryByText(/Couldn't check/)).not.toBeInTheDocument();
  });

  it("shows the waiting payment once the server refuses a change because of it", async () => {
    getBooking.mockResolvedValueOnce(bookingWith("overdue"));
    getBooking.mockResolvedValue(bookingWith("pending_review"));
    setPlotPaymentTerms.mockRejectedValue(new ApiError(409, "payment_awaiting_review", "payment_awaiting_review"));
    const user = userEvent.setup();
    renderSection();
    await user.click(await screen.findByRole("button", { name: "Edit prices" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/until that payment is approved or rejected/)).toBeInTheDocument();
    expect(await screen.findByText(/the customer submitted a payment for/)).toBeInTheDocument();
  });

  it.each(["Basic sale price (₹)", "Amount received to date (₹)"])("doesn't let a booked plot lose its %s", async (label) => {
    getBooking.mockResolvedValue(bookingWith("overdue"));
    const user = userEvent.setup();
    renderSection();
    await user.click(await screen.findByRole("button", { name: "Edit prices" }));
    await user.clear(screen.getByLabelText(label));
    expect(screen.queryByText(/saving removes this plot's prices/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText(/can't be left empty/)).toBeInTheDocument();
    expect(setPlotPaymentTerms).not.toHaveBeenCalled();
  });

  it("sends the plan's permanent code, so a changed or reused short code can't move the plot", async () => {
    getBooking.mockResolvedValue(bookingWith("overdue"));
    setPlotPaymentTerms.mockResolvedValue(plot());
    const user = userEvent.setup();
    renderSection();
    await user.click(await screen.findByRole("button", { name: "Edit prices" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(setPlotPaymentTerms.mock.calls[0][3]).toMatchObject({ payment_plan: "PP1/FPP/10-15-25-25-15-10" });
  });

  it("still sends what the admin typed when they name another plan", async () => {
    getBooking.mockResolvedValue(bookingWith("overdue"));
    setPlotPaymentTerms.mockResolvedValue(plot());
    const user = userEvent.setup();
    renderSection();
    await user.click(await screen.findByRole("button", { name: "Edit prices" }));
    await user.clear(screen.getByLabelText("Payment plan"));
    await user.type(screen.getByLabelText("Payment plan"), "PP3");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(setPlotPaymentTerms.mock.calls[0][3]).toMatchObject({ payment_plan: "PP3" });
  });
});

describe("CustomerPaymentPlans - website bookings on a shared account", () => {
  it("lists each booking under its own applicant", async () => {
    listBookings.mockResolvedValue(page([item("BK-A1"), item("BK-A2", { applicant_name: "Mr. List Name" })]));
    getBooking.mockImplementation(async (_t: string, id: string) => {
      if (id === "BK-A2") throw new ApiError(500, "down");
      return { ...detail(id, "Plan", ["Row"]), applicant_name: "Mrs. Detail Name" };
    });
    renderSection();
    const table = await screen.findByRole("table", { name: "Plots and payment plans" });
    const names = within(table).getAllByRole("row").slice(1).map((r) => within(r).getAllByRole("cell")[1].textContent);
    expect(names).toEqual(["Mrs. Detail Name", "Mr. List Name"]);
    expect(screen.getByText(/shared by 2 applicants/)).toBeInTheDocument();
  });

  it("falls back to the account holder on an older backend", async () => {
    listBookings.mockResolvedValue(page([item("BK-A1"), item("BK-A2")]));
    getBooking.mockImplementation(async (_t: string, id: string) => detail(id, "Plan", ["Row"]));
    renderSection();
    const table = await screen.findByRole("table", { name: "Plots and payment plans" });
    expect(within(table).getAllByText("Asha")).toHaveLength(2);
    expect(screen.queryByText(/shared by/)).not.toBeInTheDocument();
  });
});

describe("CustomerPaymentPlans - showing a plot's demand letter on the customer's website", () => {
  const priced = { demand_letter_available: true, terms_status: "complete" as const, sale_price: 1000000, total: 1000000 };
  const dropdown = (plot: string) => screen.getByRole("combobox", { name: `Show demand letter on website for plot ${plot}` });
  /** The saved plot, as the server sends it back. */
  const saving = (plots: ApiCustomerPlot[]) =>
    setPlotDemandLetterOnWebsite.mockImplementation(async (_t: string, _c: string, doc: string, on: boolean) => ({
      ...plots.find((p) => p.document_id === doc)!,
      demand_letter_on_website: on,
    }));

  it("has its own Yes / No for each plot, off until the admin says yes", async () => {
    const user = userEvent.setup();
    const plots = [
      offlinePlot("D7", { ...priced, demand_letter_on_website: false }),
      offlinePlot("D8", { ...priced, demand_letter_on_website: false }),
    ];
    listBookings.mockResolvedValue(page([]));
    getCustomerDetail.mockResolvedValue({ plots });
    saving(plots);
    renderSection();

    await screen.findByRole("heading", { name: /Plot D7/ });
    expect(dropdown("D7")).toHaveValue("no");
    expect(dropdown("D8")).toHaveValue("no");
    expect(within(cardOf(screen.getByRole("heading", { name: /Plot D7/ }))).getByText(/Download is disabled/)).toBeInTheDocument();

    await user.selectOptions(dropdown("D7"), "yes");
    expect(setPlotDemandLetterOnWebsite).toHaveBeenCalledTimes(1);
    expect(setPlotDemandLetterOnWebsite).toHaveBeenCalledWith("token", CUSTOMER, "DOC-D7", true);
    await waitFor(() => expect(dropdown("D7")).toHaveValue("yes"));
    expect(dropdown("D8")).toHaveValue("no");
    expect(within(cardOf(screen.getByRole("heading", { name: /Plot D7/ }))).queryByText(/Download is disabled/)).not.toBeInTheDocument();

    await user.selectOptions(dropdown("D7"), "no");
    expect(setPlotDemandLetterOnWebsite).toHaveBeenLastCalledWith("token", CUSTOMER, "DOC-D7", false);
    await waitFor(() => expect(dropdown("D7")).toHaveValue("no"));
    expect(setPlotDemandLetterOnWebsite).toHaveBeenCalledTimes(2);
  });

  it("is on a website booking's card too, for that booking's own record", async () => {
    const user = userEvent.setup();
    const record = offlinePlot("A12", { record_type: "website", booking_id: "BK-A12", document_id: "DOC-WEB",
      terms_editable: false, demand_letter_on_website: false, ...priced });
    listBookings.mockResolvedValue(page([item("BK-A12"), item("BK-B07")]));
    getBooking.mockImplementation(async (_t: string, id: string) => detail(id, "Plan", ["Row"]));
    getCustomerDetail.mockResolvedValue({ plots: [record] });
    saving([record]);
    renderSection();

    await screen.findByRole("heading", { name: /Plot A12/ });
    await user.selectOptions(dropdown("A12"), "yes");
    expect(setPlotDemandLetterOnWebsite).toHaveBeenCalledWith("token", CUSTOMER, "DOC-WEB", true);
    await waitFor(() => expect(dropdown("A12")).toHaveValue("yes"));
    // A booking whose record didn't come back has nothing to set.
    expect(screen.queryByRole("combobox", { name: /plot B07/ })).not.toBeInTheDocument();
    // The website record is never shown as an offline plot card of its own.
    expect(screen.getAllByRole("heading", { name: /Plot A12/ })).toHaveLength(1);
  });

  it("can't be changed again while it is saving, and goes back when saving fails", async () => {
    const user = userEvent.setup();
    let fail!: (err: unknown) => void;
    setPlotDemandLetterOnWebsite.mockReturnValue(new Promise((_, reject) => (fail = reject)));
    listBookings.mockResolvedValue(page([]));
    getCustomerDetail.mockResolvedValue({ plots: [offlinePlot("D7", { ...priced, demand_letter_on_website: false })] });
    renderSection();

    await screen.findByRole("heading", { name: /Plot D7/ });
    await user.selectOptions(dropdown("D7"), "yes");
    expect(dropdown("D7")).toHaveValue("yes");
    expect(dropdown("D7")).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Saving...");

    fail(new ApiError(404, "plot_not_found", "plot_not_found"));
    expect(await screen.findByRole("alert")).toHaveTextContent("This plot doesn't belong to this customer.");
    expect(dropdown("D7")).toHaveValue("no");
    expect(dropdown("D7")).toBeEnabled();

    setPlotDemandLetterOnWebsite.mockRejectedValue(new TypeError("Failed to fetch"));
    await user.selectOptions(dropdown("D7"), "yes");
    expect(await screen.findByRole("alert")).toHaveTextContent("The setting could not be saved. Please try again.");
    expect(dropdown("D7")).toHaveValue("no");
  });

  it("says when the customer will get it: once the plot has prices", async () => {
    listBookings.mockResolvedValue(page([]));
    getCustomerDetail.mockResolvedValue({ plots: [offlinePlot("D7", { demand_letter_on_website: true })] });
    renderSection();
    await screen.findByRole("heading", { name: /Plot D7/ });
    expect(dropdown("D7")).toHaveValue("yes");
    expect(screen.getByText(/once its prices are entered/)).toBeInTheDocument();
  });

  it("isn't offered by an older server that doesn't send it", async () => {
    listBookings.mockResolvedValue(page([]));
    getCustomerDetail.mockResolvedValue({ plots: [offlinePlot("D7", priced)] });
    renderSection();
    await screen.findByRole("heading", { name: /Plot D7/ });
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("drops a reply that arrives after the admin left the customer", async () => {
    const user = userEvent.setup();
    let answer!: (plot: ApiCustomerPlot) => void;
    setPlotDemandLetterOnWebsite.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    listBookings.mockResolvedValue(page([]));
    const plot = offlinePlot("D7", { ...priced, demand_letter_on_website: false });
    getCustomerDetail.mockResolvedValue({ plots: [plot] });
    const { unmount } = renderSection();
    await screen.findByRole("heading", { name: /Plot D7/ });
    await user.selectOptions(dropdown("D7"), "yes");
    unmount();
    answer({ ...plot, demand_letter_on_website: true });
    await Promise.resolve();
    expect(setPlotDemandLetterOnWebsite).toHaveBeenCalledTimes(1);
  });
});
