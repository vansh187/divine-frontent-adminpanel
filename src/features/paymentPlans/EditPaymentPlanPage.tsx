import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { BackLink } from "../../components/ui/BackLink";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import {
  ApiError,
  createPaymentPlanVersion,
  listAdminPaymentPlans,
  updatePaymentPlanDetails,
  type ApiPaymentPlan,
} from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { PaymentPlanForm } from "./PaymentPlanForm";
import {
  buildPlanPayload,
  planApiErrorMessage,
  planEdit,
  planFormValues,
  planSubmitErrorMessage,
  validatePlanEdit,
  type PlanEdit,
} from "./planForm";
import { currentPlanVersions, planName, plotUsage, plotsText, type PlansPageState } from "./planList";

function nextVersion(plans: ApiPaymentPlan[], code: string) {
  return Math.max(...plans.filter((p) => p.code === code).map((p) => p.version)) + 1;
}

/** What saving will do, so the admin knows who is affected before they press the button. */
function SaveEffect({ edit, plan, plans }: { edit: PlanEdit; plan: ApiPaymentPlan; plans: ApiPaymentPlan[] }) {
  if (edit.kind === "none") return <p className="text-sm text-text-muted">Nothing has been changed yet.</p>;

  if (edit.kind === "details")
    return (
      <Card className="p-5 text-sm text-text-muted">
        <h2 className="mb-2 text-sm font-bold text-text">When you save</h2>
        <p>
          Only the plan's name or description changes. Instalments stay exactly as they are
          {plan.is_active ? ", and customers see the new text within a minute." : ", and the plan stays inactive."}
        </p>
      </Card>
    );

  const plots = plotUsage(plans, plan.code)?.total;
  return (
    <Card className="p-5 text-sm text-text-muted">
      <h2 className="mb-2 text-sm font-bold text-text">When you save</h2>
      <ul className="list-disc space-y-1.5 pl-5">
        <li>
          The plan is saved as version v{nextVersion(plans, plan.code)}, and new bookings use it within a minute.
        </li>
        <li>
          Website bookings already on this plan are <span className="font-semibold text-text">not affected</span>: they
          keep the instalments, due dates and demand letters they booked with.
        </li>
        <li>
          Offline buyers' plots also stay as they are until their prices are next saved on the customer page. That
          rebuilds their instalments from the new version.
        </li>
        {!!plots && <li>{plotsText(plots)} on this plan right now.</li>}
      </ul>
      {!plan.is_active && (
        <p className="mt-3 rounded-xl border border-gold/30 bg-gold/10 p-3 text-text">
          This plan is inactive. Saving these changes also <span className="font-semibold">makes it active</span>, so
          customers can choose it. You can deactivate it again from the Payment Plans page.
        </p>
      )}
    </Card>
  );
}

function EditPlanForm({
  accessToken,
  plan,
  plans,
}: {
  accessToken: string | null;
  plan: ApiPaymentPlan;
  plans: ApiPaymentPlan[];
}) {
  const navigate = useNavigate();
  const [initialValues] = useState(() => planFormValues(plan));

  /** Refuses to save over a change made elsewhere since this page loaded. */
  async function assertUnchanged(token: string) {
    const res = await listAdminPaymentPlans(token);
    const all = Array.isArray(res.plans) ? res.plans : [];
    const latest = currentPlanVersions(all).find((p) => p.code === plan.code);
    if (!latest) throw new ApiError(404, "payment_plan_not_found", "payment_plan_not_found");
    if (
      latest.version !== plan.version ||
      !!latest.is_active !== !!plan.is_active ||
      latest.last_updated_date !== plan.last_updated_date ||
      nextVersion(all, plan.code) !== nextVersion(plans, plan.code)
    )
      throw new ApiError(409, "payment_plan_version_conflict", "payment_plan_version_conflict");
  }

  return (
    <PaymentPlanForm
      accessToken={accessToken}
      initialValues={initialValues}
      existingPlans={plans}
      lockCode
      validate={(values) => validatePlanEdit(plan, values, plans)}
      // Preview only: the plan's place in the dropdown doesn't matter there.
      buildPayload={(values) => buildPlanPayload(values, [])}
      canSubmit={(values) => planEdit(plan, values).kind !== "none"}
      submitLabel={(values) =>
        !plan.is_active && planEdit(plan, values).kind === "version" ? "Save and Activate" : "Save Changes"
      }
      submittingLabel="Saving..."
      // A name / description edit doesn't send the instalments, so they can't be why it was refused.
      saveErrorMessage={(error, values, payload) =>
        planEdit(plan, values).kind === "details" ? planApiErrorMessage(error) : planSubmitErrorMessage(error, payload)
      }
      footnote={(values) => <SaveEffect edit={planEdit(plan, values)} plan={plan} plans={plans} />}
      save={async (token, values) => {
        const edit = planEdit(plan, values);
        if (edit.kind === "none") return;
        await assertUnchanged(token);
        const saved =
          edit.kind === "details"
            ? await updatePaymentPlanDetails(token, edit.payload)
            : await createPaymentPlanVersion(token, edit.payload);
        const state: PlansPageState = {
          edited: {
            code: plan.code,
            notice:
              edit.kind === "details"
                ? `${planName(saved)} was updated.`
                : `${planName(saved)} was updated and is now on version v${saved.version}. New bookings will use it within a minute; website bookings already on this plan are not affected.`,
          },
        };
        navigate("/admin/payment-plans", { replace: true, state });
      }}
    />
  );
}

export function EditPaymentPlanPage() {
  const { accessToken } = useAuth();
  const [params] = useSearchParams();
  const code = params.get("code") ?? "";

  // Loaded once per visit: a token refresh must not replace the plan under an edit in progress.
  const [plans, setPlans] = useState<ApiPaymentPlan[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const loaded = plans !== null;

  useEffect(() => {
    if (!accessToken || loaded) return;
    let cancelled = false;
    listAdminPaymentPlans(accessToken)
      .then((res) => {
        if (cancelled) return;
        setError(null);
        setPlans(Array.isArray(res.plans) ? res.plans : []);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Failed to load the payment plan.");
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, loaded, attempt]);

  const plan = plans ? (currentPlanVersions(plans).find((p) => p.code === code) ?? null) : null;

  return (
    <div>
      <BackLink to="/admin/payment-plans" label="Back to Payment Plans" />
      <PageHeader
        title="Edit Payment Plan"
        subtitle={plan ? `${planName(plan)} · version v${plan.version}${plan.is_active ? "" : " · inactive"}` : undefined}
      />
      {error ? (
        <Card className="p-5 text-sm text-danger">
          <p className="mb-3">{error}</p>
          <Button
            variant="outline"
            onClick={() => {
              setError(null);
              setAttempt((n) => n + 1);
            }}
          >
            Try again
          </Button>
        </Card>
      ) : !plans ? (
        <Card className="p-5 text-sm text-text-muted">Loading payment plan...</Card>
      ) : !plan ? (
        <Card className="p-5 text-sm text-text-muted">This payment plan was not found. It may have been removed.</Card>
      ) : (
        <>
          {plan.valid === false && (
            <div className="mb-4 rounded-xl border border-danger/30 bg-danger-bg p-3 text-sm text-danger">
              This plan's stored instalments are invalid and can't be shown. Enter them again below to repair the plan.
            </div>
          )}
          <EditPlanForm key={plan.code} accessToken={accessToken} plan={plan} plans={plans} />
        </>
      )}
    </div>
  );
}
