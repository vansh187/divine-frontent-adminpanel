import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BackLink } from "../../components/ui/BackLink";
import { PageHeader } from "../../components/ui/PageHeader";
import { createPaymentPlan, listAdminPaymentPlans, type ApiPaymentPlan } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { PaymentPlanForm } from "./PaymentPlanForm";
import { buildPlanPayload, starterInstalments, validatePlanForm, type PlanFormValues } from "./planForm";
import type { PlansPageState } from "./planList";

export function NewPaymentPlanPage() {
  const { accessToken } = useAuth();
  const navigate = useNavigate();

  // Project is never pre-filled: blank means "all projects".
  const [initialValues] = useState<PlanFormValues>(() => ({
    code: "",
    shortCode: "",
    name: "",
    description: "",
    projectId: "",
    instalments: starterInstalments(),
  }));
  const [existingPlans, setExistingPlans] = useState<ApiPaymentPlan[]>([]);

  // Existing plans feed the project suggestions, duplicate checks and the new plan's
  // position in the dropdown.
  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    listAdminPaymentPlans(accessToken)
      .then((res) => {
        if (cancelled || !Array.isArray(res.plans)) return;
        setExistingPlans(res.plans);
      })
      .catch(() => {
        // Suggestions only — the form still works without them.
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  return (
    <div>
      <BackLink to="/admin/payment-plans" label="Back to Payment Plans" />
      <PageHeader
        title="Add Payment Plan"
        subtitle="The new plan is active immediately and appears in the customer booking dropdown."
      />
      <PaymentPlanForm
        accessToken={accessToken}
        initialValues={initialValues}
        existingPlans={existingPlans}
        validate={(values) => validatePlanForm(values, existingPlans)}
        buildPayload={(values) => buildPlanPayload(values, existingPlans)}
        submitLabel="Create Payment Plan"
        submittingLabel="Creating..."
        save={async (token, _values, payload) => {
          const created = await createPaymentPlan(token, payload);
          const state: PlansPageState = { createdCode: created.code ?? payload.code };
          navigate("/admin/payment-plans", { replace: true, state });
        }}
      />
    </div>
  );
}
