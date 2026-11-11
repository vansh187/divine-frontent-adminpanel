/**
 * Pure rules behind the Add Payment Plan form: field validation, the "Counted from"
 * mapping, the due wording, and the exact payload sent to the backend. Kept free of
 * React so they can be unit-tested and checked against the backend's contract tests.
 */
import {
  ApiError,
  type ApiPaymentPlan,
  type PaymentPlanCreatePayload,
  type PlanChargeHead,
  type PlanDueTrigger,
} from "../../lib/api";
import { PAIR_CHARGE_HEADS, chargesIn } from "./planLabels";

// Mirrors the backend's rules (service_payment_plans.normalize_definition).
const CODE_RE = /^[A-Za-z0-9][A-Za-z0-9/_.-]{1,79}$/;
const SHORT_CODE_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,19}$/;
const PROJECT_RE = /^[a-z0-9][a-z0-9-]{0,99}$/;
const PERCENT_RE = /^\d+(\.\d{1,3})?$/;
export const MAX_INSTALMENTS = 24;
export const MAX_DUE_DAYS = 3650;
// Text limits, same as the backend DTOs. Inputs use them as maxLength and show a counter.
export const CODE_MAX = 80;
export const SHORT_CODE_MAX = 20;
const NAME_MIN = 2;
export const NAME_MAX = 150;
export const PROJECT_MAX = 100;
export const DESCRIPTION_MAX = 1000;
export const LABEL_MAX = 150;
export const COUNTED_FROM_MAX = 100;
// Reserved by the backend: GET /payment-plans/preview would clash with the plan's URL.
const RESERVED_CODE = "preview";

// Offered as suggestions in the free-text "Counted from" field.
export const BOOKING_DATE = "Booking date";
export const POSSESSION_DATE = "Offer of Possession date";

export const API_ERROR_MESSAGES: Record<string, string> = {
  payment_plan_exists: "A payment plan with this code already exists. Use a different plan code.",
  short_code_in_use: "Another active plan already uses this short code.",
  invalid_plan_code: "Plan code is invalid. Use letters, numbers and / _ . - only.",
  invalid_short_code: "Short code is invalid. Use letters, numbers and - only (max 20).",
  invalid_plan_name: "Plan name must be 2 to 150 characters.",
  invalid_description: "Description is too long (max 1000 characters).",
  invalid_project_id: "Project ID is invalid. Use lowercase letters, numbers and - only.",
  invalid_instalments: "One of the instalments is invalid. Check the labels, percentages, counted from and days.",
  invalid_payment_plan:
    "The plan is invalid: percentages must add up to 100 and each charge can be added to only one instalment.",
  sale_price_too_small: "The instalment split produces amounts that are too small. Check the percentages.",
};

// Shown when the server rejects a plan that relies on the backend update for a free-text
// "Counted from", a booking amount not due on the booking date, or a two-charge combination.
export const NEEDS_BACKEND_UPDATE_MESSAGE =
  'The server did not accept this plan. Custom "Counted from" events, a booking amount that is not due on the booking date, and two-charge combinations (e.g. PLC + IFMS) need a server update that may not be live yet. Use "Booking date" or "Offer of Possession date" (with 0 days for the first instalment) and single charges or "All", or contact the tech team.';

export const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";

export interface InstalmentDraft {
  key: number;
  label: string;
  percent: string;
  /** Free text: "Booking date", "Offer of Possession date" or any other event. */
  countedFrom: string;
  dueDays: string;
  chargeHead: "" | PlanChargeHead;
}

export interface PlanFormValues {
  code: string;
  shortCode: string;
  name: string;
  description: string;
  projectId: string;
  instalments: InstalmentDraft[];
}

let nextKey = 1;
export function blankInstalment(overrides: Partial<InstalmentDraft> = {}): InstalmentDraft {
  return {
    key: nextKey++,
    label: "",
    percent: "",
    countedFrom: "",
    dueDays: "",
    chargeHead: "",
    ...overrides,
  };
}

/**
 * Maps the typed "Counted from" text onto a trigger. The booking and Offer of Possession
 * dates are known to the system, so their due dates are calculated automatically; any
 * other wording is a "custom" event shown to customers as typed, with no automatic date.
 */
export function triggerFor(countedFrom: string): PlanDueTrigger {
  const text = countedFrom
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/^(the )?(date of )?/, "")
    .replace(/ date$/, "");
  if (text === "booking") return "booking";
  if (text === "possession" || text === "offer of possession") return "possession";
  return "custom";
}

/** The "Counted from" text as stored: trimmed, inner whitespace collapsed (same as the backend). */
export function cleanEventText(countedFrom: string) {
  return countedFrom.trim().replace(/\s+/g, " ");
}

/** Whole days from the "Days later" text; blank or invalid counts as 0 (validation flags invalid). */
export function parseDays(raw: string) {
  const value = raw.trim();
  return /^\d+$/.test(value) ? Number(value) : 0;
}

/** Percent as thousandths, so 33.333 + 33.333 + 33.334 sums exactly. */
export function toThousandths(value: string) {
  return PERCENT_RE.test(value.trim()) ? Math.round(Number(value.trim()) * 1000) : null;
}

export function formatThousandths(value: number) {
  return `${Number((value / 1000).toFixed(3))}%`;
}

export function totalThousandths(instalments: InstalmentDraft[]) {
  return instalments.reduce((sum, row) => sum + (toThousandths(row.percent) ?? 0), 0);
}

/** Same wording as the backend's due_text, so the admin sees what customers will see. */
export function dueSummary(row: Pick<InstalmentDraft, "countedFrom" | "dueDays">) {
  if (!row.countedFrom.trim()) return "-";
  const days = parseDays(row.dueDays);
  const trigger = triggerFor(row.countedFrom);
  const event =
    trigger === "booking" ? "booking" : trigger === "possession" ? "Offer of Possession" : cleanEventText(row.countedFrom);
  return days ? `${days} days after ${event}` : `On ${event}`;
}

export function dueDateNote(row: Pick<InstalmentDraft, "countedFrom">) {
  if (!row.countedFrom.trim())
    return 'Enter what the due date is counted from, e.g. "Booking date" or "Offer of Possession date".';
  const trigger = triggerFor(row.countedFrom);
  if (trigger === "booking") return "Due date is calculated automatically from the booking date.";
  if (trigger === "possession")
    return "Due date is calculated automatically once the project's Offer of Possession date is set.";
  return "No automatic due date: customers see this wording only, and no overdue reminders are sent for it.";
}

/**
 * Every field error keyed by field (`code`, `label-<rowKey>`, `chargeHeads`, …).
 * Empty object = valid.
 */
export function validatePlanForm(values: PlanFormValues, existingPlans: ApiPaymentPlan[]): Record<string, string> {
  const errors: Record<string, string> = {};
  // Lengths are checked on the trimmed value (what is sent); maxLength on the
  // inputs caps the raw value, so these only fire for too-short input.
  const trimmedCode = values.code.trim();
  if (!trimmedCode) errors.code = "Plan code is required.";
  else if (trimmedCode.toLowerCase() === RESERVED_CODE)
    errors.code = `"${trimmedCode}" is a reserved word and can't be used as a plan code.`;
  else if (trimmedCode.length < 2 || trimmedCode.length > CODE_MAX)
    errors.code = `Plan code must be 2 to ${CODE_MAX} characters.`;
  else if (!CODE_RE.test(trimmedCode))
    errors.code = "Use letters, numbers and / _ . - only, starting with a letter or number.";
  // Case-insensitive, so near-identical permanent codes (PP5/... vs pp5/...) can't coexist.
  else if (existingPlans.some((p) => p.code.toLowerCase() === trimmedCode.toLowerCase()))
    errors.code = "A plan with this code already exists.";

  const trimmedShort = values.shortCode.trim();
  if (!trimmedShort) errors.shortCode = "Short code is required.";
  else if (trimmedShort.length > SHORT_CODE_MAX) errors.shortCode = `Max ${SHORT_CODE_MAX} characters.`;
  else if (!SHORT_CODE_RE.test(trimmedShort))
    errors.shortCode = "Use letters, numbers and - only, starting with a letter or number.";
  else if (
    existingPlans.some((p) => p.is_active && (p.short_code ?? "").toLowerCase() === trimmedShort.toLowerCase())
  )
    errors.shortCode = "An active plan already uses this short code.";

  const trimmedName = values.name.trim();
  if (trimmedName.length < NAME_MIN || trimmedName.length > NAME_MAX)
    errors.name = `Plan name must be ${NAME_MIN} to ${NAME_MAX} characters.`;

  const trimmedProject = values.projectId.trim();
  if (trimmedProject.length > PROJECT_MAX) errors.projectId = `Max ${PROJECT_MAX} characters.`;
  else if (trimmedProject && !PROJECT_RE.test(trimmedProject))
    errors.projectId = "Lowercase letters, numbers and - only (e.g. suraksha-enclave).";

  values.instalments.forEach((row) => {
    const label = row.label.trim();
    if (!label) errors[`label-${row.key}`] = "Label is required.";
    else if (label.length > LABEL_MAX) errors[`label-${row.key}`] = `Max ${LABEL_MAX} characters.`;
    const pct = toThousandths(row.percent);
    if (pct === null || pct <= 0 || pct > 100000) errors[`percent-${row.key}`] = "Between 0 and 100, up to 3 decimals.";
    const countedFrom = row.countedFrom.trim();
    if (!countedFrom) errors[`from-${row.key}`] = "Enter what the due date is counted from.";
    else if (countedFrom.length > COUNTED_FROM_MAX) errors[`from-${row.key}`] = `Max ${COUNTED_FROM_MAX} characters.`;
    if (row.dueDays.trim() && (!/^\d+$/.test(row.dueDays.trim()) || Number(row.dueDays) > MAX_DUE_DAYS))
      errors[`days-${row.key}`] = `Whole days, 0 to ${MAX_DUE_DAYS}.`;
  });

  // Each individual charge may be added once, whether alone, in a pair or via "All".
  const charges = values.instalments.flatMap((r) => (r.chargeHead ? chargesIn(r.chargeHead) : []));
  if (new Set(charges).size !== charges.length)
    errors.chargeHeads =
      'Each charge (PLC, IFMS, CAM) can be added to only one instalment — e.g. "PLC + IFMS" on one instalment and "PLC" on another is not allowed.';

  const total = totalThousandths(values.instalments);
  if (values.instalments.length === 0) errors.instalments = "Add at least one instalment.";
  else if (total !== 100000)
    errors.instalments = `Instalment percentages must add up to 100% (currently ${formatThousandths(total)}).`;

  return errors;
}

/** The exact body sent to POST /admin/payment-plans and /validate. */
export function buildPlanPayload(values: PlanFormValues, existingPlans: ApiPaymentPlan[]): PaymentPlanCreatePayload {
  // Admins no longer set a display order: new plans go after the existing ones in
  // the customer dropdown. Omitted (backend default 0) if the plan list didn't load.
  const maxOrder = Math.max(-1, ...existingPlans.map((p) => p.sort_order ?? 0));
  return {
    code: values.code.trim(),
    short_code: values.shortCode.trim(),
    name: values.name.trim(),
    description: values.description.trim() || null,
    project_id: values.projectId.trim() || null,
    ...(maxOrder >= 0 ? { sort_order: Math.min(1000, maxOrder + 1) } : {}),
    instalments: values.instalments.map((row) => {
      const trigger = triggerFor(row.countedFrom);
      return {
        label: row.label.trim(),
        percent: Number(row.percent.trim()),
        due_trigger: trigger,
        due_days: parseDays(row.dueDays),
        // Only custom events carry their wording, so standard plans send exactly what they always did.
        ...(trigger === "custom" ? { due_from: cleanEventText(row.countedFrom) } : {}),
        charge_head: row.chargeHead || null,
      };
    }),
  };
}

/**
 * Whether the plan uses anything only the updated backend accepts: a custom "Counted
 * from" event, a two-charge combination, or a booking amount not due on the booking date.
 */
export function needsBackendUpdate(payload: PaymentPlanCreatePayload) {
  const first = payload.instalments[0];
  return (
    payload.instalments.some(
      (r) => r.due_trigger === "custom" || (!!r.charge_head && PAIR_CHARGE_HEADS.includes(r.charge_head))
    ) ||
    (!!first && (first.due_trigger !== "booking" || first.due_days !== 0))
  );
}

/** Message for a failed preview/create. `error` is whatever the API call threw. */
export function planSubmitErrorMessage(error: unknown, payload: PaymentPlanCreatePayload) {
  if (!(error instanceof ApiError)) return GENERIC_ERROR_MESSAGE;
  const apiError = error;
  // Until the backend update is live, a custom "Counted from" or a charge pair fails the
  // DTO (422) and an edited booking-amount due fails the plan rules (400) — explain that
  // instead of a generic error.
  const rejectedAsInvalid =
    apiError.status === 422 || apiError.code === "invalid_instalments" || apiError.code === "invalid_payment_plan";
  if (rejectedAsInvalid && needsBackendUpdate(payload)) return NEEDS_BACKEND_UPDATE_MESSAGE;
  return (apiError.code && API_ERROR_MESSAGES[apiError.code]) || apiError.message;
}
