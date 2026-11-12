import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, type ApiPaymentPlan } from "../../lib/api";
import { PaymentPlansPage } from "./PaymentPlansPage";

const listAdminPaymentPlans = vi.fn();
const setPaymentPlanActive = vi.fn();
vi.mock("../../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/api")>()),
  listAdminPaymentPlans: (...args: unknown[]) => listAdminPaymentPlans(...args),
  setPaymentPlanActive: (...args: unknown[]) => setPaymentPlanActive(...args),
}));
// Mutable so a test can simulate a token refresh (which re-fetches the list).
const auth = vi.hoisted(() => ({ accessToken: "token" }));
vi.mock("../../lib/auth", () => ({ useAuth: () => auth }));

function plan(overrides: Partial<ApiPaymentPlan>): ApiPaymentPlan {
  return {
    code: "PP1/FPP",
    short_code: "PP1",
    name: "Flexi Plan",
    description: null,
    project_id: null,
    version: 1,
    is_active: true,
    sort_order: 1,
    valid: true,
    instalments: [],
    ...overrides,
  };
}

/**
 * A fake backend that behaves like the real one: the PATCH switches the code's active
 * version (else its newest) and replies with the code's current view, which after a
 * deactivation is the newest version, not necessarily the one switched off.
 */
function fakeServer(initial: ApiPaymentPlan[]) {
  let plans = initial.map((p) => ({ ...p }));
  listAdminPaymentPlans.mockImplementation(async () => ({ count: plans.length, plans: plans.map((p) => ({ ...p })) }));
  setPaymentPlanActive.mockImplementation(async (_token: string, code: string, active: boolean) => {
    const versions = plans.filter((p) => p.code === code).sort((a, b) => b.version - a.version);
    const target = versions.find((p) => p.is_active) ?? versions[0];
    plans = plans.map((p) => {
      if (p.code !== code) return p;
      if (p.version === target.version) return { ...p, is_active: active };
      return active ? { ...p, is_active: false } : p;
    });
    const after = plans.filter((p) => p.code === code).sort((a, b) => b.version - a.version);
    return { ...(after.find((p) => p.is_active) ?? after[0]) };
  });
}

function page(state?: { createdCode: string }) {
  return (
    <MemoryRouter initialEntries={[{ pathname: "/admin/payment-plans", state }]}>
      <PaymentPlansPage />
    </MemoryRouter>
  );
}

async function renderPage(state?: { createdCode: string }) {
  const user = userEvent.setup({ delay: null });
  const view = render(page(state));
  await screen.findByLabelText("Current payment plan");
  /** Simulates a token refresh: the page fetches the list again. */
  const refreshToken = (token: string) => {
    auth.accessToken = token;
    view.rerender(page(state));
  };
  return { user, refreshToken };
}

const select = () => screen.getByLabelText<HTMLSelectElement>("Current payment plan");

describe("PaymentPlansPage activate / deactivate", () => {
  beforeEach(() => {
    listAdminPaymentPlans.mockReset();
    setPaymentPlanActive.mockReset();
    auth.accessToken = "token";
  });

  it("deactivates the selected plan after confirmation, keeping it selected", async () => {
    fakeServer([plan({}), plan({ code: "PP2/CLP", short_code: "PP2", name: "Construction Plan", sort_order: 2 })]);
    const { user } = await renderPage();

    await user.click(screen.getByRole("button", { name: "Deactivate Plan" }));
    expect(screen.getByText("Deactivate payment plan?")).toBeInTheDocument();
    expect(screen.getByText(/not affected/)).toBeInTheDocument();
    expect(setPaymentPlanActive).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Deactivate" }));

    expect(setPaymentPlanActive).toHaveBeenCalledWith("token", "PP1/FPP", false);
    expect(await screen.findByRole("status")).toHaveTextContent(
      "PP1 — Flexi Plan is now inactive. New customers can't choose it; customers already on this plan are not affected."
    );
    expect(screen.queryByText("Deactivate payment plan?")).not.toBeInTheDocument();
    // Still showing PP1 (now last in the list, as inactive) and offering to activate it.
    expect(select().value).toBe("PP1/FPP");
    expect(select().options[select().options.length - 1].textContent).toBe("PP1 — Flexi Plan (Inactive)");
    expect(screen.getByRole("button", { name: "Activate Plan" })).toBeInTheDocument();
    expect(screen.getByText(/1 active plan · 1 inactive/)).toBeInTheDocument();
    // The list is reloaded from the server afterwards.
    await waitFor(() => expect(listAdminPaymentPlans).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("button", { name: "Activate Plan" })).toBeInTheDocument();
  });

  it("cancel closes the dialog without calling the server", async () => {
    fakeServer([plan({})]);
    const { user } = await renderPage();
    await user.click(screen.getByRole("button", { name: "Deactivate Plan" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Deactivate payment plan?")).not.toBeInTheDocument();
    expect(setPaymentPlanActive).not.toHaveBeenCalled();
  });

  it("re-activates an inactive plan, naming the version that will be used", async () => {
    fakeServer([plan({ is_active: false })]);
    const { user } = await renderPage();

    await user.click(screen.getByRole("button", { name: "Activate Plan" }));
    expect(screen.getByText(/Version v1 will be used/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Activate" }));

    expect(setPaymentPlanActive).toHaveBeenCalledWith("token", "PP1/FPP", true);
    expect(await screen.findByRole("status")).toHaveTextContent("PP1 — Flexi Plan is active again.");
    expect(screen.getByRole("button", { name: "Deactivate Plan" })).toBeInTheDocument();
  });

  it("marks the deactivated version inactive even when the server replies with a newer version", async () => {
    // v1 active, a newer v2 inactive: the server's reply after deactivating v1 describes v2.
    fakeServer([plan({ version: 2, is_active: false, name: "Flexi Plan v2" }), plan({ version: 1, is_active: true })]);
    const { user } = await renderPage();
    expect(screen.getByText(/1 active plan/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Deactivate Plan" }));
    // The admin is warned that activating later switches on v2, not v1.
    expect(screen.getByText(/A newer version \(v2\) of this plan exists/)).toHaveTextContent(
      "v2 will be switched on, not v1"
    );
    await user.click(screen.getByRole("button", { name: "Deactivate" }));

    await screen.findByRole("status");
    expect(screen.getByText(/0 active plans · 1 inactive/)).toBeInTheDocument();
    // The page now shows v2: the version "Activate Plan" would turn on.
    expect(screen.getByRole("button", { name: "Activate Plan" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Flexi Plan v2" })).toBeInTheDocument();
    await waitFor(() => expect(listAdminPaymentPlans).toHaveBeenCalledTimes(2));
    expect(screen.getByText(/0 active plans · 1 inactive/)).toBeInTheDocument();
  });

  it("ignores a list request that was started before the change but finishes after it", async () => {
    fakeServer([plan({})]);
    const { user, refreshToken } = await renderPage();
    await user.click(screen.getByRole("button", { name: "Deactivate Plan" }));

    // A token refresh starts a slow list request while the dialog is open; it will answer
    // with the plan as it was before the change.
    let resolveStale!: (value: { count: number; plans: ApiPaymentPlan[] }) => void;
    listAdminPaymentPlans.mockImplementationOnce(() => new Promise((resolve) => (resolveStale = resolve)));
    refreshToken("token-2");

    await user.click(screen.getByRole("button", { name: "Deactivate" }));
    expect(setPaymentPlanActive).toHaveBeenCalledWith("token-2", "PP1/FPP", false);
    await screen.findByRole("status");
    await waitFor(() => expect(screen.getByRole("button", { name: "Activate Plan" })).toBeInTheDocument());

    // The stale answer lands last and must not undo the change.
    await act(async () => resolveStale({ count: 1, plans: [plan({ is_active: true })] }));
    expect(screen.getByRole("button", { name: "Activate Plan" })).toBeInTheDocument();
    expect(select().options[0].textContent).toBe("PP1 — Flexi Plan (Inactive)");
  });

  it("keeps the updated list when the reload after the change fails", async () => {
    fakeServer([plan({})]);
    const { user } = await renderPage();
    listAdminPaymentPlans.mockRejectedValueOnce(new ApiError(500, "down"));

    await user.click(screen.getByRole("button", { name: "Deactivate Plan" }));
    await user.click(screen.getByRole("button", { name: "Deactivate" }));
    await screen.findByRole("status");
    await waitFor(() => expect(listAdminPaymentPlans).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("down")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Activate Plan" })).toBeInTheDocument();
  });

  it("hides the 'created and is now active' banner once the plan is toggled", async () => {
    fakeServer([plan({})]);
    const { user } = await renderPage({ createdCode: "PP1/FPP" });
    expect(screen.getByText(/was created and is now active/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Deactivate Plan" }));
    await user.click(screen.getByRole("button", { name: "Deactivate" }));

    expect(await screen.findByRole("status")).toHaveTextContent("is now inactive");
    expect(screen.queryByText(/was created and is now active/)).not.toBeInTheDocument();
  });

  it("shows a clear error when the short code is taken by another active plan", async () => {
    fakeServer([plan({ is_active: false })]);
    setPaymentPlanActive.mockRejectedValue(new ApiError(409, "short_code_in_use", "short_code_in_use"));
    const { user } = await renderPage();

    await user.click(screen.getByRole("button", { name: "Activate Plan" }));
    await user.click(screen.getByRole("button", { name: "Activate" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Another active plan already uses this plan's short code")
    );
    // Dialog stays open, plan unchanged.
    expect(screen.getByText("Activate payment plan?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Activate Plan" })).toBeInTheDocument();
  });

  it("falls back to the server's message, or a generic one when the request never reached it", async () => {
    fakeServer([plan({})]);
    setPaymentPlanActive.mockRejectedValueOnce(new ApiError(500, "Server exploded", "internal_error"));
    setPaymentPlanActive.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const { user } = await renderPage();

    await user.click(screen.getByRole("button", { name: "Deactivate Plan" }));
    await user.click(screen.getByRole("button", { name: "Deactivate" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Server exploded");

    await user.click(screen.getByRole("button", { name: "Deactivate" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong. Please try again."));
  });

  it("uses the latest list while the dialog is open and won't repeat a change that already happened", async () => {
    fakeServer([plan({})]);
    const { user, refreshToken } = await renderPage();
    await user.click(screen.getByRole("button", { name: "Deactivate Plan" }));
    expect(screen.getByRole("button", { name: "Deactivate" })).toBeEnabled();

    // Meanwhile another admin deactivated the plan; a reload brings that in.
    listAdminPaymentPlans.mockResolvedValueOnce({ count: 1, plans: [plan({ is_active: false })] });
    refreshToken("token-2");

    expect(await screen.findByText("This plan is already inactive. Nothing needs to change.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Deactivate" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Deactivate" }));
    expect(setPaymentPlanActive).not.toHaveBeenCalled();
  });

  it("says so when the plan disappears from the list while the dialog is open", async () => {
    fakeServer([plan({}), plan({ code: "PP2/CLP", short_code: "PP2", sort_order: 2 })]);
    const { user, refreshToken } = await renderPage();
    await user.click(screen.getByRole("button", { name: "Deactivate Plan" }));

    listAdminPaymentPlans.mockResolvedValueOnce({ count: 1, plans: [plan({ code: "PP2/CLP", short_code: "PP2" })] });
    refreshToken("token-2");

    expect(await screen.findByText("This plan is no longer in the list. Reload the page.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Deactivate" })).toBeDisabled();
  });
});
