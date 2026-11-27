import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, type ApiCustomer } from "../../lib/api";
import { CustomersListPage } from "./CustomersListPage";

const listCustomers = vi.fn();
const createCustomer = vi.fn();
vi.mock("../../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/api")>()),
  listCustomers: (...args: unknown[]) => listCustomers(...args),
  createCustomer: (...args: unknown[]) => createCustomer(...args),
}));
vi.mock("../../lib/auth", () => ({ useAuth: () => ({ accessToken: "token" }) }));

function customer(id: string, name: string, plots: string[]): ApiCustomer {
  return {
    id, full_name: name, email: null, phone: null, source: "OFFLINE_IMPORT", status: "BOOKED",
    created_at: "2026-11-01T10:00:00Z", last_activity_at: "2026-11-01T10:00:00Z",
    plot_plans: plots.map((unit_number) => ({ project_name: "Suraksha Enclave", unit_number, payment_plan: "PP1" })),
  };
}

const reply = (...items: ApiCustomer[]) => ({
  items,
  pagination: { page: 1, page_size: 20, total_items: items.length, total_pages: 1 },
});
const box = () => screen.getByLabelText("Search customers by name, email, phone or plot number");

function show() {
  render(
    <MemoryRouter>
      <CustomersListPage />
    </MemoryRouter>
  );
  return userEvent.setup();
}

beforeEach(() => {
  listCustomers.mockReset();
  createCustomer.mockReset();
});

describe("CustomersListPage search by plot number", () => {
  it("tells the admin a plot number can be searched", async () => {
    listCustomers.mockResolvedValue(reply());
    show();
    expect(box()).toHaveAttribute("placeholder", "Search by name, email, phone or plot number");
    await screen.findByText("No customers match your filters.");
  });

  it("asks the server for the plot, and shows its holder", async () => {
    const all = reply(customer("C1", "Rohit Mehra", ["D7"]), customer("C2", "Asha Verma", ["C16"]));
    listCustomers.mockImplementation(async (_t: string, params: { search?: string }) =>
      params.search === "D-7" ? reply(customer("C1", "Rohit Mehra", ["D7", "D8"])) : all
    );
    const user = show();
    await screen.findByText("Asha Verma");
    await user.type(box(), "D-7");
    await waitFor(() => expect(screen.queryByText("Asha Verma")).not.toBeInTheDocument());
    const row = (await screen.findByText("Rohit Mehra")).closest("tr") as HTMLElement;
    expect(within(row).getByText("D7")).toBeInTheDocument();
  });

  it("goes back to the first page for a new search, and only then", async () => {
    listCustomers.mockImplementation(async (_t: string, params: { search?: string; page: number }) =>
      params.search
        ? reply(customer("C1", "Rohit Mehra", ["D7"]))
        : { items: [customer(`P${params.page}`, `Page ${params.page}`, [])], pagination: { page: params.page, page_size: 20, total_items: 60, total_pages: 3 } }
    );
    const user = show();
    await screen.findByText("Page 1");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Page 2");
    // Spaces aren't a search: the page doesn't move.
    await user.type(box(), "   ");
    await new Promise((resolve) => setTimeout(resolve, 450));
    expect(screen.getByText("Page 2")).toBeInTheDocument();

    await user.type(box(), "D7 ");
    expect(await screen.findByText("Rohit Mehra")).toBeInTheDocument();
    expect(listCustomers).toHaveBeenLastCalledWith("token", expect.objectContaining({ search: "D7", page: 1 }));
    expect(listCustomers.mock.calls.filter(([, p]) => p.search && p.page !== 1)).toHaveLength(0);
  });

  it("keeps the server's order, where the plot's holder comes first", async () => {
    listCustomers.mockResolvedValue(reply(customer("C1", "Zoya Plot", ["C16"]), customer("C2", "Amit Phone", [])));
    const user = show();
    await user.type(box(), "16");
    await waitFor(() => expect(listCustomers).toHaveBeenLastCalledWith("token", expect.objectContaining({ search: "16" })));
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("Zoya Plot");
    expect(rows[1]).toHaveTextContent("Amit Phone");
  });

  it("says when no one holds the plot, and comes back when the search is cleared", async () => {
    listCustomers.mockImplementation(async (_t: string, params: { search?: string }) =>
      params.search ? reply() : reply(customer("C1", "Rohit Mehra", ["D7"]))
    );
    const user = show();
    await screen.findByText("Rohit Mehra");
    await user.type(box(), "Z99");
    expect(await screen.findByText("No customers match your filters.")).toBeInTheDocument();
    await user.clear(box());
    expect(await screen.findByText("Rohit Mehra")).toBeInTheDocument();
    expect(listCustomers.mock.calls.at(-1)![1].search).toBeUndefined();
  });

  it("combines the plot with the other filters", async () => {
    listCustomers.mockResolvedValue(reply());
    const user = show();
    await user.type(box(), "D7");
    await user.selectOptions(screen.getAllByRole("combobox")[1], "BOOKED");
    await waitFor(() =>
      expect(listCustomers).toHaveBeenLastCalledWith("token", expect.objectContaining({ search: "D7", status: "BOOKED", page: 1 }))
    );
  });

  it("never leaves an earlier search's customers under a search that failed", async () => {
    let down = true;
    listCustomers.mockImplementation(async (_t: string, params: { search?: string }) => {
      if (!params.search) return reply(customer("C2", "Asha Verma", ["C16"]));
      if (down) throw new ApiError(500, "Search is unavailable");
      return reply(customer("C1", "Rohit Mehra", ["D7"]));
    });
    const user = show();
    await screen.findByText("Asha Verma");
    await user.type(box(), "D7");
    expect(await screen.findByText("Search is unavailable")).toBeInTheDocument();
    expect(screen.queryByText("Asha Verma")).not.toBeInTheDocument();
    // A failure isn't an answer: it must not read as "no one holds this plot".
    expect(screen.queryByText("No customers match your filters.")).not.toBeInTheDocument();

    down = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Rohit Mehra")).toBeInTheDocument();
    expect(screen.queryByText("Search is unavailable")).not.toBeInTheDocument();
  });

  it("ignores an earlier search's reply that arrives after a later one", async () => {
    let first!: (value: unknown) => void;
    listCustomers.mockImplementation((_t: string, params: { search?: string }) => {
      if (params.search === "D7") return new Promise((resolve) => (first = resolve));
      return Promise.resolve(params.search === "C16" ? reply(customer("C2", "Asha Verma", ["C16"])) : reply());
    });
    const user = show();
    await user.type(box(), "D7");
    await waitFor(() => expect(first).toBeDefined());
    await user.clear(box());
    await user.type(box(), "C16");
    await screen.findByText("Asha Verma");
    first(reply(customer("C1", "Rohit Mehra", ["D7"])));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText("Rohit Mehra")).not.toBeInTheDocument();
  });

  it("doesn't let a search be longer than the server accepts", async () => {
    listCustomers.mockResolvedValue(reply());
    show();
    expect(box()).toHaveAttribute("maxlength", "200");
    await screen.findByText("No customers match your filters.");
  });
});

describe("CustomersListPage filters and pages", () => {
  it("offers only the statuses and sources the server accepts", async () => {
    listCustomers.mockResolvedValue(reply());
    show();
    await screen.findByText("No customers match your filters.");
    const values = screen.getAllByRole("combobox").map((s) => within(s).getAllByRole<HTMLOptionElement>("option").map((o) => o.value));
    expect(values).toEqual([
      ["ALL", "WEBSITE", "BROKER_CHANNEL", "OFFLINE_IMPORT"],
      ["ALL", "ACTIVE", "BOOKED"],
    ]);
  });

  it("shows the last page when the list got shorter than the page that was open", async () => {
    let pages = 3;
    listCustomers.mockImplementation(async (_t: string, params: { page: number }) => ({
      items: params.page <= pages ? [customer(`P${params.page}`, `Page ${params.page}`, [])] : [],
      pagination: { page: params.page, page_size: 20, total_items: pages * 20, total_pages: pages },
    }));
    const user = show();
    await screen.findByText("Page 1");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Page 2");
    pages = 1;
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("Page 1")).toBeInTheDocument();
  });

  it("settles on an empty first page", async () => {
    listCustomers.mockResolvedValue({ items: [], pagination: { page: 1, page_size: 20, total_items: 0, total_pages: 0 } });
    show();
    expect(await screen.findByText("No customers match your filters.")).toBeInTheDocument();
    expect(listCustomers).toHaveBeenCalledTimes(1);
  });
});

describe("CustomersListPage adding a customer", () => {
  const dialog = () => screen.getByRole("dialog");
  async function fill(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: "Add Customer" }));
    await user.type(within(dialog()).getByLabelText("Full name"), "Nina Rao");
    await user.type(within(dialog()).getByLabelText("Email"), "nina@example.com");
    await user.type(within(dialog()).getByLabelText("Phone"), "9000000009");
  }
  const submit = () => within(dialog()).getByRole("button", { name: /Add Customer|Adding/ });

  it("shows the new customer at once, with no filter set on page 1", async () => {
    let added = false;
    listCustomers.mockImplementation(async () =>
      added ? reply(customer("C9", "Nina Rao", []), customer("C1", "Rohit Mehra", ["D7"])) : reply(customer("C1", "Rohit Mehra", ["D7"]))
    );
    createCustomer.mockImplementation(async () => {
      added = true;
      return customer("C9", "Nina Rao", []);
    });
    const user = show();
    await screen.findByText("Rohit Mehra");
    await fill(user);
    expect(dialog()).toHaveTextContent("Status: Active");
    await user.click(submit());
    expect(await screen.findByText("Nina Rao")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(createCustomer).toHaveBeenCalledWith("token", { full_name: "Nina Rao", email: "nina@example.com", phone: "9000000009" });
  });

  it("clears a search and filters so the new customer is in view", async () => {
    listCustomers.mockResolvedValue(reply());
    createCustomer.mockResolvedValue(customer("C9", "Nina Rao", []));
    const user = show();
    await user.type(box(), "D7");
    await user.selectOptions(screen.getAllByRole("combobox")[1], "BOOKED");
    await waitFor(() => expect(listCustomers).toHaveBeenLastCalledWith("token", expect.objectContaining({ search: "D7", status: "BOOKED" })));
    await fill(user);
    await user.click(submit());
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => {
      const last = listCustomers.mock.calls.at(-1)![1];
      expect([last.search, last.status, last.page]).toEqual([undefined, undefined, 1]);
    });
    expect(box()).toHaveValue("");
  });

  it("sends it once, and can't be closed, while it is being added", async () => {
    listCustomers.mockResolvedValue(reply());
    let finish!: (value: unknown) => void;
    createCustomer.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const user = show();
    await fill(user);
    await user.click(submit());
    await user.type(within(dialog()).getByLabelText("Phone"), "{Enter}");
    expect(createCustomer).toHaveBeenCalledTimes(1);
    expect(within(dialog()).getByRole("button", { name: "Cancel" })).toBeDisabled();
    await user.click(within(dialog()).getByRole("button", { name: "Close" }));
    expect(dialog()).toBeInTheDocument();
    finish(customer("C9", "Nina Rao", []));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it.each([
    ["a duplicate email", new ApiError(409, "email_already_exists", "email_already_exists"), "A customer with this email already exists."],
    ["a message from the server", new ApiError(422, "phone: too long"), "phone: too long"],
    ["no connection", new TypeError("Failed to fetch"), "Something went wrong. Please try again."],
  ])("keeps what was typed and explains %s, without reloading the list", async (_, error, message) => {
    listCustomers.mockResolvedValue(reply());
    createCustomer.mockRejectedValue(error);
    const user = show();
    await screen.findByText("No customers match your filters.");
    await fill(user);
    await user.click(submit());
    expect(await within(dialog()).findByText(message)).toBeInTheDocument();
    expect(within(dialog()).getByLabelText("Full name")).toHaveValue("Nina Rao");
    expect(listCustomers).toHaveBeenCalledTimes(1);
  });
});
