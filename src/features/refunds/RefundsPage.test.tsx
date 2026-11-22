import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, type ApiRefundDetail } from "../../lib/api";
import { RefundsPage } from "./RefundsPage";

const listRefunds = vi.fn();
const getRefund = vi.fn();
const markRefundCollected = vi.fn();
vi.mock("../../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/api")>()),
  listRefunds: (...args: unknown[]) => listRefunds(...args),
  getRefund: (...args: unknown[]) => getRefund(...args),
  markRefundCollected: (...args: unknown[]) => markRefundCollected(...args),
}));
vi.mock("../../lib/auth", () => ({ useAuth: () => ({ accessToken: "token" }) }));

function refund(overrides: Partial<ApiRefundDetail>): ApiRefundDetail {
  return {
    id: "abcdef12-0000", booking_id: "BKG-1", customer_id: "C1", customer_name: "Asha", project_name: "Suraksha Enclave",
    unit_number: "A1", amount: 250000, currency: "INR", method: "cheque", status: "bank_transfer_pending",
    refund_initiated_date: null, refund_completed_date: null, utr_number: null, refund_note: null,
    created_at: "2026-11-01T10:00:00Z", ...overrides,
  };
}

async function open(data: ApiRefundDetail) {
  listRefunds.mockResolvedValue({ items: [data], pagination: { page: 1, page_size: 20, total_items: 1, total_pages: 1 } });
  getRefund.mockResolvedValue(data);
  const user = userEvent.setup();
  render(<RefundsPage />);
  await user.click(await screen.findByRole("button", { name: "View" }));
  await screen.findByRole("heading", { name: /^Refund ABCDEF12/ });
  return user;
}

beforeEach(() => {
  listRefunds.mockReset();
  getRefund.mockReset();
  markRefundCollected.mockReset();
});

describe("RefundsPage - a refund paid back by hand", () => {
  it("lets a cheque refund be closed, with no gateway details or retry", async () => {
    const user = await open(refund({}));
    const row = screen.getByText("A1", { exact: false, selector: "td" }).closest("tr") as HTMLElement;
    expect(within(row).getByText("Cheque")).toBeInTheDocument();
    expect(within(row).getByText("Cheque Refund Pending")).toBeInTheDocument();
    expect(screen.queryByText("Gateway Refund ID")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry Refund" })).not.toBeInTheDocument();

    markRefundCollected.mockResolvedValue(refund({ status: "bank_transfer_completed" }));
    await user.click(screen.getByRole("button", { name: "Mark Collected" }));
    await user.click(screen.getByRole("button", { name: "Confirm Collected" }));
    await waitFor(() => expect(markRefundCollected).toHaveBeenCalledWith("token", "abcdef12-0000", undefined));
    expect(await screen.findByText("Cheque Refund Completed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark Collected" })).not.toBeInTheDocument();
  });

  it("never offers a retry for a cheque refund, even while processing", async () => {
    await open(refund({ status: "processing" }));
    expect(screen.queryByRole("button", { name: "Retry Refund" })).not.toBeInTheDocument();
  });

  it("keeps a gateway refund as it was", async () => {
    await open(refund({ method: "razorpay", status: "processing" }));
    expect(screen.getByRole("button", { name: "Retry Refund" })).toBeInTheDocument();
    expect(screen.getByText("Gateway Refund ID")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark Collected" })).not.toBeInTheDocument();
  });

  it("keeps the bank-transfer wording for RTGS/NEFT", async () => {
    await open(refund({ method: "rtgs_neft" }));
    expect(screen.getAllByText("Bank Transfer Pending").length).toBeGreaterThan(1);
    expect(screen.getByRole("button", { name: "Mark Collected" })).toBeInTheDocument();
  });
});

describe("RefundsPage - filter the server doesn't know", () => {
  it("says so instead of showing a validation error", async () => {
    listRefunds.mockImplementation(async (_t: string, params: { method?: string }) => {
      if (params.method === "cheque") throw new ApiError(422, "Input should be 'razorpay', 'cash' or 'rtgs_neft'");
      return { items: [], pagination: { page: 1, page_size: 20, total_items: 0, total_pages: 1 } };
    });
    const user = userEvent.setup();
    render(<RefundsPage />);
    await screen.findByText("No refunds match your filters.");
    await user.selectOptions(screen.getAllByRole("combobox")[1], "cheque");
    expect(await screen.findByText(/can't filter refunds by Cheque yet/)).toBeInTheDocument();
  });
});
