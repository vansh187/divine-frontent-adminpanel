import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { Select } from "../../components/ui/Select";
import { ApiError, listAdminPaymentPlans, type ApiPaymentPlan } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { PlanDetails } from "./PlanDetails";

/**
 * One entry per plan code: the active version, else the newest. The API returns
 * every version, newest first within each code.
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

function planOptionLabel(plan: ApiPaymentPlan) {
  const name = [plan.short_code, plan.name].filter(Boolean).join(" — ") || plan.code;
  return plan.is_active ? name : `${name} (Inactive)`;
}

export function PaymentPlansPage() {
  const { accessToken } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // Read once: the "created" banner belongs to this visit only. The history entry's
  // state is cleared below so a reload or Back/Forward doesn't show it again.
  const [createdCode] = useState<string | null>(
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

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    listAdminPaymentPlans(accessToken)
      .then((res) => {
        if (cancelled) return;
        setLoad({ token: accessToken, plans: Array.isArray(res.plans) ? res.plans : [], error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setLoad((prev) => ({
          token: accessToken,
          plans: prev.plans,
          error: err instanceof ApiError ? err.message : "Failed to load payment plans.",
        }));
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const current = useMemo(() => currentPlanVersions(plans), [plans]);
  const activeCount = current.filter((p) => p.is_active).length;
  const selected = current.find((p) => p.code === selectedCode) ?? current[0] ?? null;

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
            <Select
              id="payment-plan-select"
              className="w-full max-w-full truncate sm:w-auto sm:min-w-[420px]"
              value={selected?.code ?? ""}
              onChange={(e) => setSelectedCode(e.target.value)}
            >
              {current.map((plan) => (
                <option key={plan.code} value={plan.code}>
                  {planOptionLabel(plan)}
                </option>
              ))}
            </Select>
            <p className="mt-1.5 text-xs text-text-soft">
              {activeCount} active plan{activeCount === 1 ? "" : "s"}
              {current.length > activeCount ? ` · ${current.length - activeCount} inactive` : ""}
            </p>
          </Card>

          {selected && <PlanDetails plan={selected} />}
        </div>
      )}
    </div>
  );
}
