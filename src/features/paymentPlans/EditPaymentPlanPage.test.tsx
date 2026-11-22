import { render, screen, waitFor } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, type ApiPaymentPlan } from "../../lib/api";
import { EditPaymentPlanPage } from "./EditPaymentPlanPage";
import { editPlanPath } from "./planList";

vi.setConfig({ testTimeout: 30_000 });

const listAdminPaymentPlans = vi.fn();
const validatePaymentPlan = vi.fn();
const updatePaymentPlanDetails = vi.fn();
const createPaymentPlanVersion = vi.fn();
vi.mock("../../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/api")>()),
  listAdminPaymentPlans: (...args: unknown[]) => listAdminPaymentPlans(...args),
  validatePaymentPlan: (...args: unknown[]) => validatePaymentPlan(...args),
  updatePaymentPlanDetails: (...args: unknown[]) => updatePaymentPlanDetails(...args),
  createPaymentPlanVersion: (...args: unknown[]) => createPaymentPlanVersion(...args),
}));
// Mutable so a test can simulate a token refresh.
const auth = vi.hoisted(() => ({ accessToken: "token" }));
vi.mock("../../lib/auth", () => ({ useAuth: () => auth }));

const CODE = "PP1/FPP/10-40-50";

function plan(overrides: Partial<ApiPaymentPlan> = {}): ApiPaymentPlan {
  return {
    code: CODE,
    short_code: "PP1",
    name: "Flexi Plan",
    description: "Old text",
    project_id: "suraksha-enclave",
    version: 1,
    is_active: true,
    sort_order: 3,
    valid: true,
    last_updated_date: "2026-11-01T00:00:00+00:00",
    instalments: [
      { seq: 1, label: "Booking Amount", percent: 10, due_trigger: "booking", due_days: null, due_text: "On booking", charge_head: null },
      {
        seq: 2,
        label: "Plinth",
        percent: 40,
        due_trigger: "custom",
        due_days: 30,
        due_from: "Completion of plinth",
        due_text: "30 days after Completion of plinth",
        charge_head: "PLC+IFMS",
      },
      { seq: 3, label: "Possession", percent: 50, due_trigger: "possession", due_days: 0, due_text: "On Offer of Possession", charge_head: "CAM" },
    ],
    ...overrides,
  };
}

const other = plan({ code: "PP2/CLP", short_code: "PP2", name: "Construction Linked" });

function ListPage() {
  const state = useLocation().state as { edited?: { code: string; notice: string } } | null;
  return (
    <p>
      Plans list {state?.edited?.code}: {state?.edited?.notice}
    </p>
  );
}

function page(code: string) {
  return (
    <MemoryRouter initialEntries={[editPlanPath(code)]}>
      <Routes>
        <Route path="/admin/payment-plans/edit" element={<EditPaymentPlanPage />} />
        <Route path="/admin/payment-plans" element={<ListPage />} />
      </Routes>
    </MemoryRouter>
  );
}

async function renderPage(plans: ApiPaymentPlan[] = [plan(), other]) {
  listAdminPaymentPlans.mockImplementation(async () => ({ count: plans.length, plans: plans.map((p) => ({ ...p })) }));
  const user = userEvent.setup({ delay: null });
  const view = render(page(CODE));
  await screen.findByLabelText("Plan name *");
  return { user, view };
}

async function setText(user: UserEvent, input: HTMLElement, value: string) {
  await user.clear(input);
  if (value) await user.type(input, value);
}

const saveButton = () => screen.getByRole("button", { name: "Save Changes" });
const values = (label: string) => screen.getAllByLabelText<HTMLInputElement>(label).map((i) => i.value);

beforeEach(() => {
  auth.accessToken = "token";
  for (const mock of [listAdminPaymentPlans, validatePaymentPlan, updatePaymentPlanDetails, createPaymentPlanVersion])
    mock.mockReset();
});

describe("EditPaymentPlanPage form", () => {
  it("starts with everything the plan has, and the code locked", async () => {
    await renderPage();
    expect(screen.getByLabelText("Plan code *")).toHaveValue(CODE);
    expect(screen.getByLabelText("Plan code *")).toBeDisabled();
    expect(screen.getByLabelText("Short code *")).toHaveValue("PP1");
    expect(screen.getByLabelText("Plan name *")).toHaveValue("Flexi Plan");
    expect(screen.getByLabelText("Project ID")).toHaveValue("suraksha-enclave");
    expect(screen.getByLabelText("Description")).toHaveValue("Old text");
    expect(values("Label *")).toEqual(["Booking Amount", "Plinth", "Possession"]);
    expect(values("% of BSP *")).toEqual(["10", "40", "50"]);
    expect(values("Counted from *")).toEqual(["Booking date", "Completion of plinth", "Offer of Possession date"]);
    expect(values("Days later")).toEqual(["", "30", "0"]);
    expect(values("Add charges")).toEqual(["", "PLC+IFMS", "CAM"]);
    expect(screen.getByText("Total: 100%")).toBeInTheDocument();
  });

  it("has nothing to save until something changes", async () => {
    const { user } = await renderPage();
    expect(saveButton()).toBeDisabled();
    await setText(user, screen.getByLabelText("Plan name *"), "Renamed");
    expect(saveButton()).toBeEnabled();
    await setText(user, screen.getByLabelText("Plan name *"), "Flexi Plan");
    expect(saveButton()).toBeDisabled();
  });

  it("edits the active version when a newer one is inactive", async () => {
    await renderPage([plan({ version: 2, is_active: false, name: "Newer" }), plan({ version: 1 })]);
    expect(screen.getByLabelText("Plan name *")).toHaveValue("Flexi Plan");
  });

  it("keeps what the admin typed when the token is refreshed", async () => {
    const { user, view } = await renderPage();
    await setText(user, screen.getByLabelText("Plan name *"), "Half typed");
    auth.accessToken = "token-2";
    view.rerender(page(CODE));
    expect(screen.getByLabelText("Plan name *")).toHaveValue("Half typed");
    expect(listAdminPaymentPlans).toHaveBeenCalledTimes(1);
  });

  it("says so when the plan doesn't exist", async () => {
    listAdminPaymentPlans.mockResolvedValue({ count: 1, plans: [other] });
    render(page(CODE));
    expect(await screen.findByText(/This payment plan was not found/)).toBeInTheDocument();
  });

  it("can retry when the plan can't be loaded", async () => {
    listAdminPaymentPlans.mockRejectedValueOnce(new ApiError(500, "down"));
    listAdminPaymentPlans.mockResolvedValue({ count: 1, plans: [plan()] });
    const user = userEvent.setup({ delay: null });
    render(page(CODE));
    expect(await screen.findByText("down")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByLabelText("Plan name *")).toHaveValue("Flexi Plan");
  });
});

describe("EditPaymentPlanPage saving", () => {
  it("changes only the name or description in place", async () => {
    updatePaymentPlanDetails.mockResolvedValue(plan({ name: "New name", description: null }));
    const { user } = await renderPage();
    await setText(user, screen.getByLabelText("Plan name *"), " New name ");
    await setText(user, screen.getByLabelText("Description"), "");
    expect(screen.getByText(/Instalments stay exactly as they are/)).toBeInTheDocument();
    await user.click(saveButton());

    expect(await screen.findByText(/PP1 — New name was updated\./)).toBeInTheDocument();
    expect(updatePaymentPlanDetails).toHaveBeenCalledWith("token", { code: CODE, name: "New name", description: "" });
    expect(createPaymentPlanVersion).not.toHaveBeenCalled();
  });

  it("saves changed instalments as a new version, with every other field as shown", async () => {
    createPaymentPlanVersion.mockResolvedValue(plan({ version: 3 }));
    const { user } = await renderPage([plan({ version: 2, plots_count: 4 }), plan({ version: 1, is_active: false, plots_count: 1 }), other]);
    await setText(user, screen.getAllByLabelText("% of BSP *")[1], "45");
    await setText(user, screen.getAllByLabelText("% of BSP *")[2], "45");
    expect(screen.getByText(/saved as version v3/)).toBeInTheDocument();
    expect(screen.getByText(/5 plots on this plan right now/)).toBeInTheDocument();
    await user.click(saveButton());

    expect(await screen.findByText(/is now on version v3/)).toBeInTheDocument();
    expect(createPaymentPlanVersion).toHaveBeenCalledWith("token", {
      code: CODE,
      short_code: "PP1",
      name: "Flexi Plan",
      description: "Old text",
      project_id: "suraksha-enclave",
      sort_order: 3,
      instalments: [
        { label: "Booking Amount", percent: 10, due_trigger: "booking", due_days: 0, charge_head: null },
        { label: "Plinth", percent: 45, due_trigger: "custom", due_days: 30, due_from: "Completion of plinth", charge_head: "PLC+IFMS" },
        { label: "Possession", percent: 45, due_trigger: "possession", due_days: 0, charge_head: "CAM" },
      ],
    });
    expect(updatePaymentPlanDetails).not.toHaveBeenCalled();
  });

  it("sends an empty project to offer the plan for all projects", async () => {
    createPaymentPlanVersion.mockResolvedValue(plan({ version: 2, project_id: null }));
    const { user } = await renderPage();
    await setText(user, screen.getByLabelText("Project ID"), "");
    await user.click(saveButton());
    await waitFor(() => expect(createPaymentPlanVersion).toHaveBeenCalledTimes(1));
    expect(createPaymentPlanVersion.mock.calls[0][1]).toMatchObject({ project_id: "" });
  });

  it("warns that an inactive plan becomes active when its instalments change, but not when only its text does", async () => {
    const { user } = await renderPage([plan({ is_active: false }), other]);
    await setText(user, screen.getByLabelText("Plan name *"), "Renamed");
    expect(screen.getByText(/the plan stays inactive/)).toBeInTheDocument();
    expect(saveButton()).toBeEnabled();

    await setText(user, screen.getAllByLabelText("Days later")[1], "45");
    expect(screen.getByText("makes it active")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save and Activate" })).toBeEnabled();
  });

  it("blocks a split that isn't 100% and another active plan's short code", async () => {
    const { user } = await renderPage();
    await setText(user, screen.getAllByLabelText("% of BSP *")[2], "40");
    await setText(user, screen.getByLabelText("Short code *"), "pp2");
    await user.click(saveButton());
    expect(await screen.findByText(/must add up to 100% \(currently 90%\)/)).toBeInTheDocument();
    expect(screen.getByText("An active plan already uses this short code.")).toBeInTheDocument();
    expect(createPaymentPlanVersion).not.toHaveBeenCalled();
  });

  it("doesn't save over a change someone else made meanwhile", async () => {
    const { user } = await renderPage();
    await setText(user, screen.getAllByLabelText("Days later")[1], "45");
    listAdminPaymentPlans.mockResolvedValue({ count: 2, plans: [plan({ version: 2 }), plan({ is_active: false })] });
    await user.click(saveButton());
    expect(await screen.findByText(/changed by someone else while you were editing it, so nothing was saved/)).toBeInTheDocument();
    expect(createPaymentPlanVersion).not.toHaveBeenCalled();
  });

  it("shows the server's refusal and keeps the form", async () => {
    createPaymentPlanVersion.mockRejectedValue(new ApiError(409, "short_code_in_use", "short_code_in_use"));
    const { user } = await renderPage();
    await setText(user, screen.getAllByLabelText("Days later")[1], "45");
    await user.click(saveButton());
    expect(await screen.findByText("Another active plan already uses this short code.")).toBeInTheDocument();
    expect(values("Days later")).toEqual(["", "45", "0"]);
  });

  it("previews without saving", async () => {
    validatePaymentPlan.mockResolvedValue(plan());
    const { user } = await renderPage();
    await user.click(screen.getByRole("button", { name: "Preview" }));
    expect(await screen.findByRole("heading", { name: "Preview" })).toBeInTheDocument();
    expect(validatePaymentPlan.mock.calls[0][1]).toMatchObject({ code: CODE, short_code: "PP1" });
    expect(createPaymentPlanVersion).not.toHaveBeenCalled();
    expect(updatePaymentPlanDetails).not.toHaveBeenCalled();
  });

  it("repairs a plan whose stored instalments are invalid by saving a new version", async () => {
    const { user } = await renderPage([plan({ valid: false, instalments: undefined })]);
    expect(screen.getByText(/stored instalments are invalid/)).toBeInTheDocument();
    expect(screen.getByText(/saved as version v2/)).toBeInTheDocument();
    await user.click(saveButton());
    expect(await screen.findByText("Please fix the highlighted fields.")).toBeInTheDocument();
    expect(updatePaymentPlanDetails).not.toHaveBeenCalled();
  });
});
