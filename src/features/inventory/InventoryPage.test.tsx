import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  type ApiInventoryProject,
  type ApiInventoryUnit,
  type ApiInventoryUnitDetail,
} from "../../lib/api";
import { InventoryPage } from "./InventoryPage";

const listInventoryProjects = vi.fn();
const listInventory = vi.fn();
const downloadInventoryCsv = vi.fn();
const saveBlob = vi.fn();
vi.mock("../../lib/download", () => ({ saveBlob: (...args: unknown[]) => saveBlob(...args) }));
const getInventoryUnit = vi.fn();
const changeInventoryStatus = vi.fn();
vi.mock("../../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/api")>()),
  listInventoryProjects: (...args: unknown[]) => listInventoryProjects(...args),
  listInventory: (...args: unknown[]) => listInventory(...args),
  downloadInventoryCsv: (...args: unknown[]) => downloadInventoryCsv(...args),
  getInventoryUnit: (...args: unknown[]) => getInventoryUnit(...args),
  changeInventoryStatus: (...args: unknown[]) => changeInventoryStatus(...args),
}));
vi.mock("../../lib/auth", () => ({ useAuth: () => ({ accessToken: "token" }) }));

function project(name: string, overrides: Partial<ApiInventoryProject> = {}): ApiInventoryProject {
  return { project_name: name, total: 0, available: 0, held: 0, reserved: 0, pending_kyc_review: 0, booked: 0, sold: 0, ...overrides };
}

function unit(overrides: Partial<ApiInventoryUnit> = {}): ApiInventoryUnit {
  return {
    id: "u1",
    project_name: "OPS Divine Greens",
    city: "Karnal",
    locality: null,
    block: "A",
    unit_number: "A-9",
    unit_type: "plot",
    width_mtr: 10,
    length_mtr: 20,
    area_sqmt: 200,
    area_sqyd: 239.2,
    status: "available",
    sale_source: null,
    status_note: null,
    last_changed_at: null,
    last_changed_by_name: null,
    ...overrides,
  };
}

function detail(overrides: Partial<ApiInventoryUnitDetail> = {}): ApiInventoryUnitDetail {
  return { ...unit(), booked_at: null, status_lock: null, allowed_statuses: ["held", "sold"], history: [], ...overrides };
}

const PROJECTS = [
  project("OPS Divine Greens", { total: 10, available: 6, sold: 2, booked: 1, held: 1 }),
  project("Suraksha Enclave", { total: 4, available: 4 }),
];

function renderPage() {
  const user = userEvent.setup({ delay: null });
  render(
    <MemoryRouter initialEntries={["/admin/inventory"]}>
      <InventoryPage />
    </MemoryRouter>
  );
  return user;
}

async function openPlot(user: ReturnType<typeof userEvent.setup>, plot: string) {
  const row = (await screen.findByText(plot)).closest("tr")!;
  await user.click(within(row).getByRole("button", { name: "View" }));
  return screen.findByRole("heading", { name: `Plot ${plot}` });
}

describe("InventoryPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listInventoryProjects.mockResolvedValue({ items: PROJECTS });
    listInventory.mockResolvedValue({
      items: [
        unit(),
        unit({ id: "u2", unit_number: "A-10", status: "sold", last_changed_at: "2026-11-13T09:30:00Z", last_changed_by_name: "Ritika Sharma" }),
      ],
      pagination: { page: 1, page_size: 20, total_items: 2, total_pages: 1 },
    });
  });

  it("shows a tab per project, its counts and each plot's status", async () => {
    const user = renderPage();
    const tabs = await screen.findAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["OPS Divine Greens10", "Suraksha Enclave4"]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");

    await screen.findByText("A-9");
    expect(listInventory).toHaveBeenLastCalledWith("token", expect.objectContaining({ project_name: "OPS Divine Greens", page: 1 }));
    // Stat card: sold + booked.
    expect(screen.getByText("Sold", { selector: "p" }).parentElement).toHaveTextContent("Sold3");
    const soldRow = screen.getByText("A-10").closest("tr")!;
    expect(within(soldRow).getByText("Sold")).toBeInTheDocument();
    expect(within(soldRow).getByText("by Ritika Sharma")).toBeInTheDocument();
    expect(within(screen.getByText("A-9").closest("tr")!).getByText("Available")).toBeInTheDocument();
    expect(screen.getAllByText("10 × 20 m")).toHaveLength(2);

    await user.click(tabs[1]);
    await waitFor(() =>
      expect(listInventory).toHaveBeenLastCalledWith("token", expect.objectContaining({ project_name: "Suraksha Enclave" }))
    );
  });

  it("filters by status", async () => {
    const user = renderPage();
    await screen.findByText("A-9");
    await user.selectOptions(screen.getByLabelText("Status"), "held");
    await waitFor(() => expect(listInventory).toHaveBeenLastCalledWith("token", expect.objectContaining({ status: "held" })));
  });

  it("changes a plot's status and shows the recorded history", async () => {
    getInventoryUnit.mockResolvedValue(detail());
    changeInventoryStatus.mockResolvedValue(
      detail({
        status: "sold",
        allowed_statuses: ["available", "held"],
        history: [
          {
            id: "h1",
            old_status: "available",
            new_status: "sold",
            changed_by_role: "admin",
            changed_by_name: "Ritika Sharma",
            source: "admin_panel",
            note: "Sold at the site office",
            changed_at: "2026-11-13T10:15:00Z",
          },
        ],
      })
    );
    const user = renderPage();
    await openPlot(user, "A-9");
    expect(await screen.findByText("No status changes recorded yet.")).toBeInTheDocument();

    const save = screen.getByRole("button", { name: "Save status" });
    expect(save).toBeDisabled();
    await user.selectOptions(screen.getByLabelText("New status"), "sold");
    await user.type(screen.getByLabelText("Note (optional)"), "Sold at the site office");
    await user.click(save);

    expect(changeInventoryStatus).toHaveBeenCalledWith("token", "u1", {
      status: "sold",
      expected_status: "available",
      note: "Sold at the site office",
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Status changed to Sold.");
    const history = screen.getByRole("list", { name: "Status history" });
    const entry = within(history).getByRole("listitem");
    expect(within(entry).getByText("Available")).toBeInTheDocument();
    expect(within(entry).getByText("Sold")).toBeInTheDocument();
    expect(entry).toHaveTextContent("Ritika Sharma");
    expect(entry).toHaveTextContent("(Admin)");
    expect(entry).toHaveTextContent("Changed in admin panel");
    expect(entry.querySelector("time")).toHaveAttribute("dateTime", "2026-11-13T10:15:00Z");
    // Counts and list reload after a change.
    await waitFor(() => expect(listInventoryProjects).toHaveBeenCalledTimes(2));
  });

  it("explains why a booked plot can't be changed and offers no save", async () => {
    getInventoryUnit.mockResolvedValue(detail({ status: "booked", status_lock: "booking", allowed_statuses: [] }));
    const user = renderPage();
    await openPlot(user, "A-9");
    expect(await screen.findByText(/booked through the website/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save status" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("New status")).not.toBeInTheDocument();
  });

  it("shows the conflict and reloads the plot when someone else changed it", async () => {
    getInventoryUnit
      .mockResolvedValueOnce(detail())
      .mockResolvedValueOnce(detail({ status: "held", allowed_statuses: ["available", "sold"] }));
    changeInventoryStatus.mockRejectedValue(
      new ApiError(409, "Someone changed this plot's status while you were looking at it.", "status_changed")
    );
    const user = renderPage();
    await openPlot(user, "A-9");
    await user.selectOptions(await screen.findByLabelText("New status"), "sold");
    await user.click(screen.getByRole("button", { name: "Save status" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Someone changed this plot's status");
    await waitFor(() => expect(getInventoryUnit).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.getByText("Status", { selector: "dt" }).parentElement).toHaveTextContent("On Hold")
    );
  });

  it("downloads the server's file with the chosen fields for the selected project and filters", async () => {
    localStorage.clear();
    const blob = new Blob(["\ufeffPlot No,Plot Status\r\nA-10,Sold\r\n"], { type: "text/csv" });
    downloadInventoryCsv.mockResolvedValue({ blob, filename: "inventory-2026-11-13.csv" });
    const user = renderPage();
    await screen.findByText("A-9");
    await user.selectOptions(screen.getByLabelText("Status"), "sold");
    await user.click(screen.getByRole("button", { name: "Export CSV" }));
    expect(screen.getByRole("heading", { name: "Export plots" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear all" }));
    for (const field of ["Plot No", "Plot Status", "Client Name", "Payment Plan"]) {
      await user.click(screen.getByRole("checkbox", { name: field }));
    }
    await user.click(screen.getByRole("button", { name: "Export 4 fields" }));

    await waitFor(() => expect(saveBlob).toHaveBeenCalledTimes(1));
    expect(downloadInventoryCsv).toHaveBeenCalledWith(
      "token",
      { project_name: "OPS Divine Greens", status: "sold", search: undefined },
      ["unit_number", "status", "payment_plan", "client_name"],
      expect.any(AbortSignal)
    );
    expect(saveBlob).toHaveBeenCalledWith(blob, "inventory-2026-11-13.csv");
  });
});
