import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiBookingListItem } from "../../lib/api";
import { BookingsQueuePage } from "./BookingsQueuePage";

const listBookings = vi.fn();
vi.mock("../../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/api")>()),
  listBookings: (...args: unknown[]) => listBookings(...args),
}));
vi.mock("../../lib/auth", () => ({ useAuth: () => ({ accessToken: "token" }) }));

function booking(overrides: Partial<ApiBookingListItem>): ApiBookingListItem {
  return {
    id: "BKG-1", customer_id: "C1", customer_name: "Account Holder", project_name: "Suraksha Enclave",
    unit_number: "D7", amount: 1574870, status: "booked", kyc_status: "pending", version: 1,
    created_at: "2026-03-21T06:30:00Z", last_activity_at: "2026-11-22T06:30:00Z", ...overrides,
  };
}

async function cellsOf(text: string) {
  const row = (await screen.findByText(text)).closest("tr") as HTMLElement;
  return within(row).getAllByRole("cell").map((c) => c.textContent);
}

beforeEach(() => {
  listBookings.mockReset();
});

function show(...items: ApiBookingListItem[]) {
  listBookings.mockResolvedValue({ items, pagination: { page: 1, page_size: 20, total_items: items.length, total_pages: 1 } });
  render(
    <MemoryRouter>
      <BookingsQueuePage />
    </MemoryRouter>
  );
}

describe("BookingsQueuePage", () => {
  it("shows the plot's applicant, money and next payment", async () => {
    show(
      booking({
        applicant_name: "Mr. Arun Rao", is_offline: true, total: 2627460, amount_received: 1574870, outstanding: 1052590,
        next_payment: { label: "Within 180 days", amount: 395725, due_date: "2026-09-17", due_text: null, days_until_due: -66, status: "overdue" },
      })
    );
    const cells = await cellsOf("BKG-1");
    expect(cells[1]).toBe("Mr. Arun RaoOffline buyer");
    expect(cells.slice(3, 6)).toEqual(["₹26,27,460", "₹15,74,870", "₹10,52,590"]);
    expect(cells[6]).toMatch(/^₹3,95,725.*Overdue by 66 days.*Overdue$/);
  });

  it("says when nothing is left to pay, and when the next payment has no date", async () => {
    show(
      booking({ id: "BKG-2", total: 3509880, amount_received: 3509880, outstanding: 0, next_payment: null }),
      booking({
        id: "BKG-3", total: 100, amount_received: 90, outstanding: 10,
        next_payment: { label: "Possession", amount: 10, due_date: null, due_text: "On Offer of Possession", days_until_due: null, status: "upcoming" },
      })
    );
    expect((await cellsOf("BKG-2"))[6]).toBe("Fully paid");
    expect((await cellsOf("BKG-3"))[6]).toBe("₹10On Offer of PossessionUpcoming");
  });

  it("still works on a backend that doesn't send the new fields", async () => {
    show(booking({}));
    const cells = await cellsOf("BKG-1");
    expect(cells[1]).toBe("Account Holder");
    expect(cells.slice(3, 7)).toEqual(["—", "₹15,74,870", "—", "—"]);
  });

  it.each(["rejected", "cancelled"] as const)("never shows a %s booking's money as received", async (status) => {
    show(booking({ status, amount: 250000 }));
    expect((await cellsOf("BKG-1")).slice(3, 7)).toEqual(["—", "—", "—", "—"]);
  });

  it("shows the booking amount of a booking still under review", async () => {
    show(booking({ status: "pending_kyc_review", amount: 250000, total: null, amount_received: null, outstanding: null }));
    expect((await cellsOf("BKG-1")).slice(3, 6)).toEqual(["—", "₹2,50,000", "—"]);
  });

  it("falls back to the customer's ID when the account has no name", async () => {
    show(booking({ customer_name: null as unknown as string }));
    expect((await cellsOf("BKG-1"))[1]).toBe("C1");
  });
});
