import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiCustomer } from "../../lib/api";
import { CustomerDetailPage } from "./CustomerDetailPage";

const listBookings = vi.fn();
const listCustomers = vi.fn();
const getCustomerDetail = vi.fn();
vi.mock("../../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/api")>()),
  listBookings: (...args: unknown[]) => listBookings(...args),
  listCustomers: (...args: unknown[]) => listCustomers(...args),
  getCustomerDetail: (...args: unknown[]) => getCustomerDetail(...args),
  getBooking: vi.fn(),
}));
vi.mock("../../lib/auth", () => ({ useAuth: () => ({ accessToken: "token" }) }));

const customer: ApiCustomer = {
  id: "CUST-1",
  full_name: "Asha Verma",
  email: "asha@example.com",
  phone: "9999999999",
  source: "WEBSITE",
  status: "BOOKED",
  created_at: "2026-11-01T10:00:00Z",
  last_activity_at: "2026-11-02T10:00:00Z",
};

beforeEach(() => {
  listBookings.mockReset();
  listCustomers.mockReset();
  getCustomerDetail.mockReset();
  getCustomerDetail.mockResolvedValue({ plots: [] });
});

describe("CustomerDetailPage", () => {
  it("shows the customer's payment plan section alongside the profile", async () => {
    listBookings.mockResolvedValue({ items: [], pagination: { page: 1, page_size: 100, total_items: 0, total_pages: 0 } });
    render(
      <MemoryRouter initialEntries={[{ pathname: "/admin/customers/CUST-1", state: { customer } }]}>
        <Routes>
          <Route path="/admin/customers/:id" element={<CustomerDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByRole("heading", { name: "Customer Profile" })).toBeInTheDocument();
    expect(await screen.findByText(/no active bookings/)).toBeInTheDocument();
    expect(listBookings).toHaveBeenCalledWith("token", expect.objectContaining({ customer_id: "CUST-1" }));
    expect(listCustomers).not.toHaveBeenCalled();
  });
});
