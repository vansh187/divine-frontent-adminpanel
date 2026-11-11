import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, type ApiPaymentPlan } from "../../lib/api";
import contract from "./__fixtures__/planPayloadContract.json";
import { NewPaymentPlanPage } from "./NewPaymentPlanPage";
import { NEEDS_BACKEND_UPDATE_MESSAGE } from "./planForm";

// These tests type whole plans into the real form, so give them more than the 5s default.
vi.setConfig({ testTimeout: 30_000 });

const listAdminPaymentPlans = vi.fn();
const validatePaymentPlan = vi.fn();
const createPaymentPlan = vi.fn();
vi.mock("../../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/api")>()),
  listAdminPaymentPlans: (...args: unknown[]) => listAdminPaymentPlans(...args),
  validatePaymentPlan: (...args: unknown[]) => validatePaymentPlan(...args),
  createPaymentPlan: (...args: unknown[]) => createPaymentPlan(...args),
}));
vi.mock("../../lib/auth", () => ({ useAuth: () => ({ accessToken: "token" }) }));

type ContractForm = (typeof contract.accepted)[number]["form"];

function existingPlans(orders: number[] | null): ApiPaymentPlan[] {
  return (orders ?? []).map((sort_order, i) => ({
    code: `EXISTING-${i}`,
    short_code: `EX${i}`,
    name: `Existing ${i}`,
    description: null,
    project_id: "suraksha-enclave",
    version: 1,
    is_active: true,
    sort_order,
  }));
}

async function renderPage(orders: number[] | null = [1, 2, 3, 4]) {
  if (orders) listAdminPaymentPlans.mockResolvedValue({ count: orders.length, plans: existingPlans(orders) });
  else listAdminPaymentPlans.mockRejectedValue(new ApiError(500, "down"));
  const user = userEvent.setup({ delay: null });
  render(
    <MemoryRouter initialEntries={["/admin/payment-plans/new"]}>
      <Routes>
        <Route path="/admin/payment-plans/new" element={<NewPaymentPlanPage />} />
        <Route path="/admin/payment-plans" element={<p>Plans list</p>} />
      </Routes>
    </MemoryRouter>
  );
  await waitFor(() => expect(listAdminPaymentPlans).toHaveBeenCalledWith("token"));
  // Let the plan list settle before the test edits the form.
  if (orders) await waitFor(() => expect(document.querySelector('option[value="suraksha-enclave"]')).not.toBeNull());
  return user;
}

async function setText(user: UserEvent, input: HTMLElement, value: string) {
  await user.clear(input);
  if (value) await user.type(input, value);
}

const rowInputs = (label: string) => screen.getAllByLabelText(label);

/** Types a contract form into the page exactly as an admin would. */
async function fillForm(user: UserEvent, form: ContractForm) {
  await setText(user, screen.getByLabelText("Plan code *"), form.code);
  await setText(user, screen.getByLabelText("Short code *"), form.shortCode);
  await setText(user, screen.getByLabelText("Plan name *"), form.name);
  await setText(user, screen.getByLabelText("Project ID"), form.projectId);
  await setText(user, screen.getByLabelText("Description"), form.description);

  while (rowInputs("Label *").length < form.instalments.length)
    await user.click(screen.getByRole("button", { name: "+ Add Instalment" }));
  while (rowInputs("Label *").length > form.instalments.length)
    await user.click(screen.getAllByRole("button", { name: "Remove" }).at(-1)!);

  for (const [i, row] of form.instalments.entries()) {
    await setText(user, rowInputs("Label *")[i], row.label);
    await setText(user, rowInputs("% of BSP *")[i], row.percent);
    await setText(user, rowInputs("Counted from *")[i], row.countedFrom);
    await setText(user, rowInputs("Days later")[i], row.dueDays);
    await user.selectOptions(rowInputs("Add charges")[i], row.chargeHead);
  }
}

beforeEach(() => {
  listAdminPaymentPlans.mockReset();
  validatePaymentPlan.mockReset();
  createPaymentPlan.mockReset();
});

describe("NewPaymentPlanPage layout", () => {
  it("has no Display order field", async () => {
    await renderPage();
    expect(screen.queryByLabelText(/display order/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/display order/i)).not.toBeInTheDocument();
  });

  it("makes Counted from an empty free-text field on every row, booking amount included", async () => {
    await renderPage();
    const counted = rowInputs("Counted from *");
    expect(counted).toHaveLength(2);
    for (const input of counted) {
      expect(input.tagName).toBe("INPUT");
      expect(input).toHaveValue("");
      expect(input).toBeEnabled();
      expect(input).toHaveAttribute("list", "payment-plan-counted-from");
    }
    const suggestions = [...document.querySelectorAll("#payment-plan-counted-from option")].map((o) =>
      o.getAttribute("value")
    );
    expect(suggestions).toEqual(["Booking date", "Offer of Possession date"]);
  });

  it("lets the booking amount's days be edited and no longer shows the lock note", async () => {
    await renderPage();
    expect(rowInputs("Days later")[0]).toBeEnabled();
    expect(rowInputs("Days later")[0]).toHaveValue("");
    expect(screen.queryByText(/Locked/)).not.toBeInTheDocument();
  });

  it("offers None, three singles, three pairs and All in Add charges", async () => {
    await renderPage();
    const options = within(rowInputs("Add charges")[0]).getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual([
      "None",
      "PLC",
      "IFMS",
      "CAM",
      "PLC + IFMS",
      "PLC + CAM",
      "IFMS + CAM",
      "All (PLC + IFMS + CAM)",
    ]);
  });

  it("shows the due wording and whether a date is calculated, live as the admin types", async () => {
    const user = await renderPage();
    const row = screen.getByText("Instalment 2").closest(".p-4") as HTMLElement;
    expect(within(row).getByText("-")).toBeInTheDocument();

    await setText(user, rowInputs("Counted from *")[1], "Completion of plinth");
    await setText(user, rowInputs("Days later")[1], "30");
    expect(within(row).getByText("30 days after Completion of plinth")).toBeInTheDocument();
    expect(within(row).getByText(/No automatic due date/)).toBeInTheDocument();

    await setText(user, rowInputs("Counted from *")[1], "Booking date");
    expect(within(row).getByText("30 days after booking")).toBeInTheDocument();
    expect(within(row).getByText(/calculated automatically from the booking date/)).toBeInTheDocument();
  });
});

describe("NewPaymentPlanPage sends exactly the contract payload", () => {
  it.each(contract.accepted.map((c) => [c.name, c] as const))("%s", async (_, c) => {
    createPaymentPlan.mockResolvedValue({ code: c.payload.code });
    const user = await renderPage(c.existingSortOrders);
    await fillForm(user, c.form);
    await user.click(screen.getByRole("button", { name: "Create Payment Plan" }));

    await waitFor(() => expect(createPaymentPlan).toHaveBeenCalledTimes(1));
    expect(createPaymentPlan).toHaveBeenCalledWith("token", c.payload);
    expect(await screen.findByText("Plans list")).toBeInTheDocument();
  });
});

describe("NewPaymentPlanPage errors", () => {
  const custom = contract.accepted.find((c) => c.name === "custom-event")!;
  const standard = contract.accepted.find((c) => c.name === "standard-booking-and-possession")!;

  it.each(contract.rejected.map((c) => [c.name, c] as const))("blocks %s before sending anything", async (_, c) => {
    const user = await renderPage();
    await fillForm(user, c.form);
    await user.click(screen.getByRole("button", { name: "Create Payment Plan" }));
    expect(await screen.findByText("Please fix the highlighted fields.")).toBeInTheDocument();
    expect(createPaymentPlan).not.toHaveBeenCalled();
  });

  it("names the overlapping-charges rule", async () => {
    const user = await renderPage();
    await fillForm(user, contract.rejected[0].form);
    await user.click(screen.getByRole("button", { name: "Create Payment Plan" }));
    expect(await screen.findByText(/can be added to only one instalment/)).toBeInTheDocument();
  });

  it("explains a pending server update when today's backend rejects a custom event (422)", async () => {
    createPaymentPlan.mockRejectedValue(new ApiError(422, "Input should be 'booking' or 'possession'"));
    const user = await renderPage(custom.existingSortOrders);
    await fillForm(user, custom.form);
    await user.click(screen.getByRole("button", { name: "Create Payment Plan" }));
    expect(await screen.findByText(NEEDS_BACKEND_UPDATE_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByText("Plans list")).not.toBeInTheDocument();
  });

  it("keeps the normal message for a standard plan", async () => {
    createPaymentPlan.mockRejectedValue(new ApiError(409, "exists", "payment_plan_exists"));
    const user = await renderPage(standard.existingSortOrders);
    await fillForm(user, standard.form);
    await user.click(screen.getByRole("button", { name: "Create Payment Plan" }));
    expect(await screen.findByText(/already exists. Use a different plan code/)).toBeInTheDocument();
  });

  it("previews with the same payload and shows the backend's worked example", async () => {
    const pair = contract.accepted.find((c) => c.name === "pair-plc-ifms")!;
    validatePaymentPlan.mockResolvedValue({
      code: pair.payload.code,
      short_code: pair.payload.short_code,
      name: pair.payload.name,
      description: null,
      project_id: pair.payload.project_id,
      version: 1,
      booking_percent: 10,
      instalments: pair.payload.instalments.map((r, i) => ({ ...r, seq: i + 1, due_text: pair.expect.dueTexts[i] })),
    });
    const user = await renderPage(pair.existingSortOrders);
    await fillForm(user, pair.form);
    await user.click(screen.getByRole("button", { name: "Preview" }));

    expect(validatePaymentPlan).toHaveBeenCalledWith("token", pair.payload);
    const preview = (await screen.findByRole("heading", { name: "Preview" })).parentElement as HTMLElement;
    const pairRow = within(preview).getByText("Within 45 days of booking").closest("tr") as HTMLElement;
    expect(within(pairRow).getByText("PLC + IFMS")).toBeInTheDocument();
    expect(within(pairRow).getByText("45 days after booking")).toBeInTheDocument();
    expect(createPaymentPlan).not.toHaveBeenCalled();
  });
});
