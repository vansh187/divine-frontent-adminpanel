import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, type ApiBookingDetail, type ApiPaymentMilestone } from "../../lib/api";
import { PaymentPlanCard } from "./PaymentPlanCard";

const recordInstallmentPayment = vi.fn();
vi.mock("../../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/api")>()),
  recordInstallmentPayment: (...args: unknown[]) => recordInstallmentPayment(...args),
}));

function milestone(overrides: Partial<ApiPaymentMilestone>): ApiPaymentMilestone {
  return {
    id: "m",
    label: "Instalment",
    percent: 25,
    due_days: 0,
    due_date: "2026-11-01",
    amount: 100000,
    status: "upcoming",
    pay_enabled_from: "2026-01-01",
    paid_on: null,
    paid_payment_id: null,
    ...overrides,
  };
}

function booking(overrides: Partial<ApiBookingDetail> = {}): ApiBookingDetail {
  return {
    id: "BK-1",
    status: "booked",
    kyc_status: "verified",
    version: 3,
    admin_note: null,
    customer_id: "CUST-1",
    customer_name: "Asha",
    customer_email: "a@example.com",
    customer_phone: "9999999999",
    project_name: "Suraksha Enclave",
    unit_number: "A-12",
    amount: 100000,
    payment_id: "PAY-1",
    payment_method: "razorpay",
    payment_status: "captured",
    utr_number: null,
    cheque_number: null,
    documents: [],
    decision_history: [],
    payment_schedule: [
      milestone({ id: "m1", label: "Booking Amount", status: "paid", paid_on: "2026-11-01T10:00:00Z", paid_payment_id: "PAY-1" }),
      milestone({ id: "m2", label: "Second", status: "paid", paid_on: "2026-12-01T10:00:00Z", paid_payment_id: "PAY-2" }),
      milestone({ id: "m3", label: "Third", status: "pending_review", amount: 200000 }),
      milestone({ id: "m4", label: "Fourth", status: "due" }),
      milestone({
        id: "m5",
        label: "On completion of plinth",
        status: "upcoming",
        due_date: null,
        due_text: "30 days after Completion of plinth",
      }),
    ],
    next_due: null,
    amount_received: 200000,
    payment_plan: { name: "Construction Linked Plan", short_code: "CLP", code: "CLP/10-40-50", version: 2 },
    created_at: "2026-11-01T10:00:00Z",
    last_activity_at: "2026-11-01T10:00:00Z",
    ...overrides,
  };
}

function rowFor(label: string) {
  return screen.getByText(label).closest("tr") as HTMLElement;
}

beforeEach(() => {
  recordInstallmentPayment.mockReset();
});

describe("PaymentPlanCard (read-only, customer page)", () => {
  it("shows the chosen plan, totals, paid count and every instalment's status", () => {
    render(<PaymentPlanCard readOnly booking={booking()} title="Payment Plan — Plot A-12" />);

    expect(screen.getByRole("heading", { name: "Payment Plan — Plot A-12" })).toBeInTheDocument();
    expect(screen.getByText("Construction Linked Plan (CLP) · v2")).toBeInTheDocument();
    expect(screen.getByText(/2 of 5 installments paid/)).toBeInTheDocument();
    expect(within(rowFor("Booking Amount")).getByText("Paid")).toBeInTheDocument();
    expect(within(rowFor("Third")).getByText("Pending Review")).toBeInTheDocument();
    expect(within(rowFor("Fourth")).getByText("Due")).toBeInTheDocument();
    expect(within(rowFor("Booking Amount")).getByText("PAY-1")).toBeInTheDocument();
  });

  it("has no Action column and no way to record a payment", () => {
    render(<PaymentPlanCard readOnly booking={booking()} />);
    expect(screen.queryByRole("columnheader", { name: "Action" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /record payment/i })).not.toBeInTheDocument();
  });

  it("shows the due wording when an instalment has no date yet", () => {
    render(<PaymentPlanCard readOnly booking={booking()} />);
    expect(within(rowFor("On completion of plinth")).getByText("30 days after Completion of plinth")).toBeInTheDocument();
  });

  it("shows '-' for a missing date when the backend sends no wording", () => {
    const schedule = [milestone({ id: "x", label: "Possession", due_date: null })];
    render(<PaymentPlanCard readOnly booking={booking({ payment_schedule: schedule })} />);
    expect(within(rowFor("Possession")).getAllByText("-").length).toBeGreaterThan(0);
  });

  it("totals submitted-but-unconfirmed money separately and still counts it as outstanding", () => {
    render(<PaymentPlanCard readOnly booking={booking()} />);
    const amountOf = (term: string) => screen.getByText(term).nextElementSibling?.textContent;
    expect(amountOf("Awaiting Confirmation")).toMatch(/2,00,000/);
    // Total 6,00,000 − received 2,00,000: money awaiting confirmation is not yet received.
    expect(amountOf("Outstanding")).toMatch(/4,00,000/);
  });

  it("hides the Awaiting Confirmation total when nothing is pending", () => {
    const schedule = booking().payment_schedule.filter((m) => m.status !== "pending_review");
    render(<PaymentPlanCard readOnly booking={booking({ payment_schedule: schedule })} />);
    expect(screen.queryByText("Awaiting Confirmation")).not.toBeInTheDocument();
  });

  it("explains an empty schedule, and still names the plan", () => {
    render(<PaymentPlanCard readOnly booking={booking({ payment_schedule: [] })} />);
    expect(screen.getByText(/Payment plan not available yet/)).toBeInTheDocument();
    expect(screen.getByText("Construction Linked Plan (CLP) · v2")).toBeInTheDocument();
  });

  it("works for legacy bookings without a plan snapshot", () => {
    render(<PaymentPlanCard readOnly booking={booking({ payment_plan: null })} />);
    expect(screen.queryByText(/Plan chosen/)).not.toBeInTheDocument();
    expect(screen.getByText(/2 of 5 installments paid/)).toBeInTheDocument();
  });
});

describe("PaymentPlanCard (booking page, editable)", () => {
  const handlers = () => ({ accessToken: "token", onUpdated: vi.fn(), onStale: vi.fn() });

  it("never offers Record Payment on an instalment awaiting confirmation", () => {
    // No next_due from the server: the first unpaid row (pending review) is the next in order.
    render(<PaymentPlanCard booking={booking()} {...handlers()} />);
    expect(within(rowFor("Third")).getByText("Awaiting confirmation")).toBeInTheDocument();
    expect(within(rowFor("Third")).queryByRole("button")).not.toBeInTheDocument();
    expect(within(rowFor("Fourth")).getByText("After earlier installments")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /record payment/i })).not.toBeInTheDocument();
  });

  it("offers Record Payment only on the server's next due instalment", () => {
    const nextDue = {
      milestone_id: "m4",
      label: "Fourth",
      amount: 100000,
      due_date: "2026-11-01",
      days_until_due: -3,
      status: "overdue" as const,
      last_reminder_kind: null,
      last_reminder_at: null,
    };
    render(<PaymentPlanCard booking={booking({ next_due: nextDue })} {...handlers()} />);
    expect(screen.getAllByRole("button", { name: /record payment/i })).toHaveLength(1);
    expect(within(rowFor("Fourth")).getByRole("button", { name: /record payment/i })).toBeEnabled();
    expect(screen.getByText(/Overdue by 3 days/)).toBeInTheDocument();
  });

  it("records a cheque payment and hands the updated booking back", async () => {
    const user = userEvent.setup();
    const props = handlers();
    const schedule = [
      milestone({ id: "m1", label: "Booking Amount", status: "paid" }),
      milestone({ id: "m2", label: "Second", status: "due", amount: 250000 }),
    ];
    const updated = booking({ payment_schedule: schedule.map((m) => ({ ...m, status: "paid" as const })) });
    recordInstallmentPayment.mockResolvedValue(updated);

    render(<PaymentPlanCard booking={booking({ payment_schedule: schedule })} {...props} />);
    await user.click(screen.getByRole("button", { name: /record payment/i }));
    await user.selectOptions(screen.getByLabelText("Payment method"), "cheque");
    const confirm = screen.getByRole("button", { name: "Confirm Received" });
    expect(confirm).toBeDisabled();
    await user.type(screen.getByLabelText("Cheque number"), "000123");
    await user.click(confirm);

    expect(recordInstallmentPayment).toHaveBeenCalledWith("token", "BK-1", "m2", {
      amount: 250000,
      method: "cheque",
      utr_number: undefined,
      cheque_number: "000123",
      note: undefined,
    });
    expect(props.onUpdated).toHaveBeenCalledWith(updated);
    expect(screen.getByText(/Second recorded as received via Cheque/)).toBeInTheDocument();
  });
});

describe("PaymentPlanCard - an instalment paid in parts", () => {
  it("keeps the full plan value and shows what is paid and left, recording only the balance", async () => {
    const user = userEvent.setup();
    const schedule = [
      milestone({ id: "m1", label: "First half", status: "paid", amount: 1313730, instalment_amount: 1313730, amount_paid: 1313730 }),
      milestone({ id: "m2", label: "Second part", status: "overdue", amount: 395725, instalment_amount: 656865, amount_paid: 261140 }),
      milestone({ id: "m3", label: "Last part", amount: 656865, instalment_amount: 656865, amount_paid: 0 }),
    ];
    const data = booking({ is_offline: true, payment_schedule: schedule, amount_received: 1574870 });
    recordInstallmentPayment.mockResolvedValue(data);
    render(<PaymentPlanCard booking={data} accessToken="token" onUpdated={vi.fn()} onStale={vi.fn()} />);

    expect(screen.getByText("Total Plan Value").nextSibling).toHaveTextContent("₹26,27,460");
    expect(screen.getByText("Outstanding").nextSibling).toHaveTextContent("₹10,52,590");
    const cells = within(rowFor("Second part")).getAllByRole("cell").map((c) => c.textContent);
    expect(cells.slice(2, 5)).toEqual(["₹6,56,865", "₹2,61,140", "₹3,95,725"]);
    expect(within(rowFor("First half")).getByText("Received offline")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /record payment/i }));
    await user.click(screen.getByRole("button", { name: "Confirm Received" }));
    expect(recordInstallmentPayment).toHaveBeenCalledWith("token", "BK-1", "m2", expect.objectContaining({ amount: 395725 }));
  });
});

describe("PaymentPlanCard - where a paid instalment's money came from", () => {
  const paid = (overrides: Partial<ApiPaymentMilestone>) =>
    booking({ payment_schedule: [milestone({ label: "Row", status: "paid", ...overrides })] });
  const cell = () => within(rowFor("Row")).getAllByRole("cell")[6].textContent;

  it("doesn't call a website booking's payment offline when its date is missing", () => {
    render(<PaymentPlanCard readOnly booking={paid({ paid_payment_id: "pay_Rzp1" })} />);
    expect(cell()).toBe("-pay_Rzp1");
  });

  it("doesn't call a payment recorded on an offline booking 'received offline'", () => {
    render(<PaymentPlanCard readOnly booking={{ ...paid({ paid_payment_id: "PAY-9" }), is_offline: true }} />);
    expect(cell()).toBe("-PAY-9");
  });

  it("says so for money an offline buyer paid before go-live", () => {
    render(<PaymentPlanCard readOnly booking={{ ...paid({}), is_offline: true }} />);
    expect(cell()).toBe("Received offline");
  });
});

describe("PaymentPlanCard - corner cases", () => {
  const handlers = () => ({ accessToken: "token", onUpdated: vi.fn(), onStale: vi.fn() });
  const due = (milestone_id: string, due_date: string | null) => ({
    milestone_id, label: "Next", amount: 100000, due_date, days_until_due: due_date ? 5 : null,
    status: "upcoming" as const, last_reminder_kind: null, last_reminder_at: null,
  });

  it("reloads instead of keeping an old amount when part of the instalment was paid meanwhile", async () => {
    const user = userEvent.setup();
    const props = handlers();
    recordInstallmentPayment.mockRejectedValue(new ApiError(400, "installment_amount_mismatch", "installment_amount_mismatch"));
    render(<PaymentPlanCard booking={booking({ payment_schedule: [milestone({ id: "m1" })] })} {...props} />);
    await user.click(screen.getByRole("button", { name: /record payment/i }));
    await user.click(screen.getByRole("button", { name: "Confirm Received" }));
    expect(props.onStale).toHaveBeenCalledWith(expect.stringContaining("nothing was recorded"));
    expect(screen.queryByRole("button", { name: "Confirm Received" })).not.toBeInTheDocument();
  });

  it("never offers to record a payment of nothing", () => {
    const schedule = [milestone({ id: "m1", status: "overdue", amount: 0, instalment_amount: 500, amount_paid: 500 })];
    render(<PaymentPlanCard booking={booking({ payment_schedule: schedule })} {...handlers()} />);
    expect(screen.getByRole("button", { name: /record payment/i })).toBeDisabled();
  });

  it("doesn't blame earlier instalments for one that waits on an event", () => {
    const schedule = [
      milestone({ id: "m1", label: "Plinth", due_date: null, due_text: "On Completion of plinth" }),
      milestone({ id: "m2", label: "Dated" }),
      milestone({ id: "m3", label: "Later" }),
    ];
    render(<PaymentPlanCard booking={booking({ payment_schedule: schedule, next_due: due("m2", "2026-12-01") })} {...handlers()} />);
    expect(within(rowFor("Plinth")).getByText("Waiting for its event")).toBeInTheDocument();
    expect(within(rowFor("Dated")).getByRole("button", { name: /record payment/i })).toBeEnabled();
    expect(within(rowFor("Later")).getByText("After earlier installments")).toBeInTheDocument();
  });

  it("names the event when the next due instalment has no date", () => {
    const schedule = [milestone({ id: "m1", label: "Possession", due_date: null, due_text: "On Offer of Possession" })];
    render(<PaymentPlanCard readOnly booking={booking({ payment_schedule: schedule, next_due: due("m1", null) })} />);
    expect(screen.getAllByText("On Offer of Possession")).toHaveLength(2);
  });
});
