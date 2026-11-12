import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Modal } from "../../components/ui/Modal";
import { PageHeader } from "../../components/ui/PageHeader";
import { Select } from "../../components/ui/Select";
import { ApiError, listAdminPaymentPlans, setPaymentPlanActive, type ApiPaymentPlan } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { API_ERROR_MESSAGES, planApiErrorMessage } from "./planForm";
import { PlanDetails, type PlotUsage } from "./PlanDetails";

// Activation reuses the create form's messages, except where the admin needs different
// guidance: on activation the clash is with an existing plan, not with what they typed.
const TOGGLE_ERROR_MESSAGES: Record<string, string> = {
  ...API_ERROR_MESSAGES,
  short_code_in_use:
    "Another active plan already uses this plan's short code. Deactivate that plan first, then activate this one.",
  payment_plan_not_found: "This plan no longer exists. Reload the page.",
};

/**
 * Switches one version of a plan on or off in the local list. Activating it retires the
 * code's other versions, as the server does. The server's reply isn't used for this: it
 * describes the code's "current" version, which after a deactivation can be a different one.
 */
function applyToggle(plans: ApiPaymentPlan[], code: string, version: number, active: boolean): ApiPaymentPlan[] {
  return plans.map((plan) => {
    if (plan.code !== code) return plan;
    if (plan.version === version) return { ...plan, is_active: active };
    return active && plan.is_active ? { ...plan, is_active: false } : plan;
  });
}

/**
 * One entry per plan code: the active version, else the newest. The API returns
 * every version, newest first within each code. This is also the version the server
 * switches on or off for that code.
 */
function currentPlanVersions(plans: ApiPaymentPlan[]): ApiPaymentPlan[] {
  const byCode = new Map<string, ApiPaymentPlan>();
  for (const plan of plans) {
    const existing = byCode.get(plan.code);
    if (!existing) {
      byCode.set(plan.code, plan);
    } else if (!existing.is_active && (plan.is_active || plan.version > existing.version)) {
      byCode.set(plan.code, plan);
    }
  }
  return [...byCode.values()].sort((a, b) => {
    if (!!a.is_active !== !!b.is_active) return a.is_active ? -1 : 1;
    const order = (a.sort_order ?? 0) - (b.sort_order ?? 0);
    return order !== 0 ? order : a.code.localeCompare(b.code);
  });
}

/**
 * Plots currently on a plan code, over all its versions: customers keep the version they
 * booked on, so older versions still count. Null when the backend doesn't send counts yet.
 */
function plotUsage(plans: ApiPaymentPlan[], code: string): PlotUsage | null {
  const versions = plans.filter((p) => p.code === code && typeof p.plots_count === "number");
  if (versions.length === 0) return null;
  const byVersion = versions
    .map((p) => ({ version: p.version, count: p.plots_count as number }))
    .sort((a, b) => a.version - b.version);
  return { total: byVersion.reduce((sum, v) => sum + v.count, 0), byVersion };
}

function plotsText(count: number) {
  return `${count} plot${count === 1 ? "" : "s"}`;
}

/** "PP1 — Flexi Plan", falling back to the plan code. */
function planName(plan: ApiPaymentPlan) {
  return [plan.short_code, plan.name].filter(Boolean).join(" — ") || plan.code;
}

function planOptionLabel(plan: ApiPaymentPlan) {
  return plan.is_active ? planName(plan) : `${planName(plan)} (Inactive)`;
}

/** The newest version of `plan`'s code, when it is newer than `plan` itself. */
function newerVersion(plans: ApiPaymentPlan[], plan: ApiPaymentPlan): ApiPaymentPlan | null {
  let newest: ApiPaymentPlan | null = null;
  for (const p of plans) {
    if (p.code === plan.code && p.version > plan.version && (!newest || p.version > newest.version)) newest = p;
  }
  return newest;
}

export function PaymentPlansPage() {
  const { accessToken } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // Read once: the "created" banner belongs to this visit only. The history entry's
  // state is cleared below so a reload or Back/Forward doesn't show it again.
  const [createdCode, setCreatedCode] = useState<string | null>(
    () => (location.state as { createdCode?: string } | null)?.createdCode ?? null
  );
  const [selectedCode, setSelectedCode] = useState<string>(createdCode ?? "");

  useEffect(() => {
    if (location.state) navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navigate]);

  // Each result records the token it was fetched with; loading is derived from that,
  // so a re-fetch (e.g. after a token refresh) always replaces an earlier error.
  const [load, setLoad] = useState<{ token: string | null; plans: ApiPaymentPlan[]; error: string | null }>({
    token: null,
    plans: [],
    error: null,
  });
  const loading = !!accessToken && load.token !== accessToken;
  const { plans, error } = load;

  // Only the newest list request may update the page: an older one still in flight
  // (e.g. started by a token refresh) would overwrite later changes with stale data.
  const listRequest = useRef(0);
  const fetchPlans = useCallback((token: string, { keepOnError = false } = {}) => {
    const request = ++listRequest.current;
    listAdminPaymentPlans(token)
      .then((res) => {
        if (request !== listRequest.current) return;
        setLoad({ token, plans: Array.isArray(res.plans) ? res.plans : [], error: null });
      })
      .catch((err) => {
        if (request !== listRequest.current || keepOnError) return;
        setLoad((prev) => ({
          token,
          plans: prev.plans,
          error: err instanceof ApiError ? err.message : "Failed to load payment plans.",
        }));
      });
  }, []);

  useEffect(() => {
    if (!accessToken) return;
    fetchPlans(accessToken);
    return () => {
      listRequest.current += 1;
    };
  }, [accessToken, fetchPlans]);

  // Plot counts change as customers book or bookings are rejected / cancelled elsewhere:
  // refresh quietly whenever the admin comes back to this tab.
  useEffect(() => {
    if (!accessToken) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") fetchPlans(accessToken, { keepOnError: true });
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [accessToken, fetchPlans]);

  const current = useMemo(() => currentPlanVersions(plans), [plans]);
  const activeCount = current.filter((p) => p.is_active).length;
  const selected = current.find((p) => p.code === selectedCode) ?? current[0] ?? null;
  const selectedUsage = selected ? plotUsage(plans, selected.code) : null;

  // Activate / deactivate a plan, after a confirmation step. Only the code and the intended
  // action are kept; the plan itself is always read from the latest list.
  const [toggleRequest, setToggleRequest] = useState<{ code: string; activate: boolean } | null>(null);
  const [toggling, setToggling] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [toggleNotice, setToggleNotice] = useState<string | null>(null);
  const togglePlan = toggleRequest ? (current.find((p) => p.code === toggleRequest.code) ?? null) : null;
  // The list changed while the dialog was open (e.g. another admin already did this).
  const alreadyDone = !!toggleRequest && !!togglePlan && !!togglePlan.is_active === toggleRequest.activate;
  const toggleNewer = togglePlan && toggleRequest && !toggleRequest.activate ? newerVersion(plans, togglePlan) : null;
  const togglePlots = togglePlan ? (plotUsage(plans, togglePlan.code)?.total ?? null) : null;

  function openToggle(plan: ApiPaymentPlan) {
    setToggleError(null);
    setToggleNotice(null);
    setToggleRequest({ code: plan.code, activate: !plan.is_active });
  }

  async function handleToggle() {
    if (!accessToken || !toggleRequest || !togglePlan || alreadyDone || toggling) return;
    const { code, activate } = toggleRequest;
    const { version } = togglePlan;
    const name = planName(togglePlan);
    setToggling(true);
    setToggleError(null);
    try {
      await setPaymentPlanActive(accessToken, code, activate);
      setLoad((prev) => ({ ...prev, plans: applyToggle(prev.plans, code, version, activate) }));
      // Then confirm against the server. This also discards any older list request still in flight.
      fetchPlans(accessToken, { keepOnError: true });
      // Keep this plan selected: re-sorting moves inactive plans to the end of the list.
      setSelectedCode(code);
      setToggleRequest(null);
      setCreatedCode(null);
      setToggleNotice(
        activate
          ? `${name} is active again. Customers will see it in the booking dropdown within a minute.`
          : `${name} is now inactive. New customers can't choose it; customers already on this plan are not affected.`
      );
    } catch (err) {
      setToggleError(planApiErrorMessage(err, TOGGLE_ERROR_MESSAGES));
    } finally {
      setToggling(false);
    }
  }

  function closeToggle() {
    if (!toggling) setToggleRequest(null);
  }

  const activating = !!toggleRequest?.activate;

  return (
    <div>
      <PageHeader
        title="Payment Plans"
        subtitle="Plans customers can choose when booking a plot"
        actions={<Button onClick={() => navigate("/admin/payment-plans/new")}>+ Add Payment Plan</Button>}
      />

      {createdCode && (
        <div className="mb-4 rounded-xl border border-success/30 bg-success-bg p-3 text-sm text-success">
          Payment plan {createdCode} was created and is now active. Customers will see it in the booking dropdown
          within a minute.
        </div>
      )}

      {toggleNotice && (
        <div role="status" className="mb-4 rounded-xl border border-success/30 bg-success-bg p-3 text-sm text-success">
          {toggleNotice}
        </div>
      )}

      {loading ? (
        <Card className="p-5 text-sm text-text-muted">Loading payment plans...</Card>
      ) : error ? (
        <Card className="p-5 text-sm text-danger">{error}</Card>
      ) : current.length === 0 ? (
        <Card className="p-5 text-sm text-text-muted">No payment plans yet. Add the first one.</Card>
      ) : (
        <div className="space-y-6">
          <Card className="p-5">
            <label htmlFor="payment-plan-select" className="mb-1.5 block text-sm font-medium text-text">
              Current payment plan
            </label>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Select
                id="payment-plan-select"
                className="w-full max-w-full truncate sm:w-auto sm:min-w-[420px]"
                value={selected?.code ?? ""}
                onChange={(e) => {
                  setSelectedCode(e.target.value);
                  setToggleNotice(null);
                }}
              >
                {current.map((plan) => (
                  <option key={plan.code} value={plan.code}>
                    {planOptionLabel(plan)}
                  </option>
                ))}
              </Select>
              {selected && (
                <Button variant={selected.is_active ? "outline" : "secondary"} onClick={() => openToggle(selected)}>
                  {selected.is_active ? "Deactivate Plan" : "Activate Plan"}
                </Button>
              )}
            </div>
            <p className="mt-1.5 text-xs text-text-soft">
              {activeCount} active plan{activeCount === 1 ? "" : "s"}
              {current.length > activeCount ? ` · ${current.length - activeCount} inactive` : ""}
            </p>
          </Card>

          {selected && <PlanDetails plan={selected} plotUsage={selectedUsage} />}
        </div>
      )}

      <Modal
        open={!!toggleRequest}
        onClose={closeToggle}
        title={activating ? "Activate payment plan?" : "Deactivate payment plan?"}
        footer={
          <>
            <Button variant="outline" onClick={closeToggle} disabled={toggling}>
              Cancel
            </Button>
            <Button
              variant={activating ? "primary" : "danger"}
              onClick={handleToggle}
              disabled={toggling || !togglePlan || alreadyDone}
            >
              {toggling ? "Saving..." : activating ? "Activate" : "Deactivate"}
            </Button>
          </>
        }
      >
        {toggleRequest && !togglePlan ? (
          <p>This plan is no longer in the list. Reload the page.</p>
        ) : togglePlan ? (
          <div className="space-y-3">
            <p className="font-semibold break-words text-text">
              {planName(togglePlan)} <span className="font-normal text-text-muted">(version v{togglePlan.version})</span>
            </p>
            {alreadyDone ? (
              <p>This plan is already {activating ? "active" : "inactive"}. Nothing needs to change.</p>
            ) : activating ? (
              <p>
                Customers will be able to choose this plan again when booking a plot, within about a minute. Version v
                {togglePlan.version} will be used, with the instalments shown on this page.
              </p>
            ) : (
              <>
                <ul className="list-disc space-y-1.5 pl-5">
                  <li>New customers will no longer see this plan when booking a plot.</li>
                  <li>
                    Customers already on this plan
                    {togglePlots ? ` (${plotsText(togglePlots)} right now)` : ""} are{" "}
                    <span className="font-semibold text-text">not affected</span>: their instalment schedule, due
                    dates, reminders and demand letters keep running as before.
                  </li>
                  <li>You can activate the plan again at any time.</li>
                </ul>
                {toggleNewer && (
                  <div className="rounded-xl border border-gold/30 bg-gold/10 p-3 text-sm text-text">
                    A newer version (v{toggleNewer.version}) of this plan exists. If you activate the plan again
                    later, v{toggleNewer.version} will be switched on, not v{togglePlan.version}.
                  </div>
                )}
              </>
            )}
            {toggleError && (
              <div role="alert" className="rounded-xl border border-danger/30 bg-danger-bg p-3 text-sm text-danger">
                {toggleError}
              </div>
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
