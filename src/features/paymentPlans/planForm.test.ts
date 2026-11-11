import { describe, expect, it } from "vitest";
import { ApiError, type ApiPaymentPlan, type PaymentPlanCreatePayload, type PlanChargeHead } from "../../lib/api";
import contract from "./__fixtures__/planPayloadContract.json";
import {
  API_ERROR_MESSAGES,
  GENERIC_ERROR_MESSAGE,
  NEEDS_BACKEND_UPDATE_MESSAGE,
  buildPlanPayload,
  cleanEventText,
  dueDateNote,
  dueSummary,
  formatThousandths,
  needsBackendUpdate,
  parseDays,
  planSubmitErrorMessage,
  toThousandths,
  totalThousandths,
  triggerFor,
  validatePlanForm,
  type InstalmentDraft,
  type PlanFormValues,
} from "./planForm";
import { CHARGE_HEAD_OPTIONS } from "./planLabels";

type ContractForm = (typeof contract.accepted)[number]["form"];

/** Contract forms carry no row keys; give each row its index as key (so errors read "from-1"). */
function toFormValues(form: ContractForm): PlanFormValues {
  return {
    ...form,
    instalments: form.instalments.map((row, i) => ({ ...row, key: i, chargeHead: row.chargeHead as InstalmentDraft["chargeHead"] })),
  };
}

function plansWithSortOrders(orders: number[] | null): ApiPaymentPlan[] {
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

function row(overrides: Partial<InstalmentDraft> = {}): InstalmentDraft {
  return { key: 0, label: "Row", percent: "100", countedFrom: "Booking date", dueDays: "", chargeHead: "", ...overrides };
}

function validForm(overrides: Partial<PlanFormValues> = {}): PlanFormValues {
  return {
    code: "PP9/FPP/10-90",
    shortCode: "PP9",
    name: "Plan Nine",
    description: "",
    projectId: "suraksha-enclave",
    instalments: [
      row({ key: 1, label: "Booking Amount", percent: "10" }),
      row({ key: 2, label: "Balance", percent: "90", dueDays: "60" }),
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// "Counted from" mapping
// ---------------------------------------------------------------------------

describe("triggerFor", () => {
  it.each([
    ["Booking date", "booking"],
    ["booking", "booking"],
    ["BOOKING DATE", "booking"],
    ["  booking   date  ", "booking"],
    ["Date of booking", "booking"],
    ["the booking date", "booking"],
    ["Offer of Possession date", "possession"],
    ["offer of possession", "possession"],
    ["Possession", "possession"],
    ["the possession date", "possession"],
    ["Date of possession", "possession"],
    ["Completion of plinth", "custom"],
    ["Booking amount received", "custom"],
    ["Possession handover", "custom"],
    ["", "custom"],
  ])("%j -> %s", (text, expected) => {
    expect(triggerFor(text)).toBe(expected);
  });
});

describe("text helpers", () => {
  it("cleanEventText trims and collapses inner whitespace like the backend", () => {
    expect(cleanEventText("  Casting of   roof\tslab ")).toBe("Casting of roof slab");
  });

  it.each([
    ["", 0],
    ["  ", 0],
    ["0", 0],
    ["45", 45],
    [" 60 ", 60],
    ["4.5", 0],
    ["-3", 0],
    ["abc", 0],
  ])("parseDays(%j) = %d", (raw, expected) => {
    expect(parseDays(raw)).toBe(expected);
  });

  it.each([
    ["10", 10000],
    ["33.333", 33333],
    [" 0.5 ", 500],
    ["100", 100000],
    ["1.2345", null],
    ["-5", null],
    ["", null],
    ["ten", null],
  ])("toThousandths(%j) = %s", (raw, expected) => {
    expect(toThousandths(raw)).toBe(expected);
  });

  it("totals exactly with thousandths and formats the total", () => {
    const rows = [row({ percent: "33.333" }), row({ percent: "33.333" }), row({ percent: "33.334" })];
    expect(totalThousandths(rows)).toBe(100000);
    expect(formatThousandths(99999)).toBe("99.999%");
    expect(formatThousandths(100000)).toBe("100%");
  });
});

describe("dueSummary / dueDateNote", () => {
  it.each([
    [{ countedFrom: "Booking date", dueDays: "" }, "On booking"],
    [{ countedFrom: "Booking date", dueDays: "0" }, "On booking"],
    [{ countedFrom: "Booking date", dueDays: "45" }, "45 days after booking"],
    [{ countedFrom: "Offer of Possession date", dueDays: "" }, "On Offer of Possession"],
    [{ countedFrom: "possession", dueDays: "30" }, "30 days after Offer of Possession"],
    [{ countedFrom: "Completion of plinth", dueDays: "" }, "On Completion of plinth"],
    [{ countedFrom: " Completion  of plinth ", dueDays: "30" }, "30 days after Completion of plinth"],
    [{ countedFrom: "", dueDays: "30" }, "-"],
    [{ countedFrom: "   ", dueDays: "" }, "-"],
  ])("%j -> %s", (input, expected) => {
    expect(dueSummary(input)).toBe(expected);
  });

  it("explains whether a due date is calculated automatically", () => {
    expect(dueDateNote({ countedFrom: "Booking date" })).toMatch(/calculated automatically from the booking date/);
    expect(dueDateNote({ countedFrom: "Offer of Possession date" })).toMatch(/once the project's Offer of Possession/);
    expect(dueDateNote({ countedFrom: "Completion of plinth" })).toMatch(/No automatic due date/);
    expect(dueDateNote({ countedFrom: "" })).toMatch(/Enter what the due date is counted from/);
  });
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe("validatePlanForm", () => {
  it("accepts a complete plan", () => {
    expect(validatePlanForm(validForm(), [])).toEqual({});
  });

  it("requires Counted from on every row, including the booking amount", () => {
    const errors = validatePlanForm(
      validForm({
        instalments: [
          row({ key: 1, percent: "10", countedFrom: "" }),
          row({ key: 2, percent: "90", countedFrom: "   " }),
        ],
      }),
      []
    );
    expect(errors["from-1"]).toBe("Enter what the due date is counted from.");
    expect(errors["from-2"]).toBe("Enter what the due date is counted from.");
  });

  it("limits Counted from to 100 characters", () => {
    const errors = validatePlanForm(
      validForm({ instalments: [row({ key: 1, countedFrom: "x".repeat(101) })] }),
      []
    );
    expect(errors["from-1"]).toBe("Max 100 characters.");
    expect(validatePlanForm(validForm({ instalments: [row({ key: 1, countedFrom: "x".repeat(100) })] }), [])).toEqual({});
  });

  it("lets the booking amount (row 1) have its own days, and validates them like any row", () => {
    const ok = validForm({
      instalments: [row({ key: 1, percent: "10", dueDays: "7" }), row({ key: 2, percent: "90", dueDays: "60" })],
    });
    expect(validatePlanForm(ok, [])).toEqual({});
    for (const bad of ["4.5", "-1", "3651", "abc"]) {
      const errors = validatePlanForm(validForm({ instalments: [row({ key: 1, dueDays: bad })] }), []);
      expect(errors["days-1"]).toBe("Whole days, 0 to 3650.");
    }
    expect(validatePlanForm(validForm({ instalments: [row({ key: 1, dueDays: "3650" })] }), [])).toEqual({});
  });

  it("requires a label and a valid percentage on each row", () => {
    const errors = validatePlanForm(validForm({ instalments: [row({ key: 1, label: " ", percent: "0" })] }), []);
    expect(errors["label-1"]).toBe("Label is required.");
    expect(errors["percent-1"]).toBe("Between 0 and 100, up to 3 decimals.");
  });

  it("requires the percentages to total exactly 100", () => {
    const errors = validatePlanForm(
      validForm({ instalments: [row({ key: 1, percent: "10" }), row({ key: 2, percent: "80" })] }),
      []
    );
    expect(errors.instalments).toBe("Instalment percentages must add up to 100% (currently 90%).");
    expect(validatePlanForm(validForm({ instalments: [] }), []).instalments).toBe("Add at least one instalment.");
  });

  it("checks plan code, short code, name and project", () => {
    const errors = validatePlanForm(
      validForm({ code: "preview", shortCode: "bad code", name: "x", projectId: "Bad Project" }),
      []
    );
    expect(errors.code).toMatch(/reserved word/);
    expect(errors.shortCode).toMatch(/letters, numbers and -/);
    expect(errors.name).toBe("Plan name must be 2 to 150 characters.");
    expect(errors.projectId).toMatch(/Lowercase letters/);
    expect(validatePlanForm(validForm({ code: "", shortCode: "" }), [])).toMatchObject({
      code: "Plan code is required.",
      shortCode: "Short code is required.",
    });
  });

  it("blocks duplicate codes (any case) and short codes of active plans only", () => {
    const existing = plansWithSortOrders([1]).map((p) => ({ ...p, code: "pp9/fpp/10-90", short_code: "pp9" }));
    expect(validatePlanForm(validForm(), existing)).toMatchObject({
      code: "A plan with this code already exists.",
      shortCode: "An active plan already uses this short code.",
    });
    const retired = existing.map((p) => ({ ...p, code: "OTHER", is_active: false }));
    expect(validatePlanForm(validForm(), retired)).toEqual({});
  });

  // Every pair of dropdown options on two different rows: an error exactly when they share a charge.
  const CHARGES_OF: Record<PlanChargeHead, string[]> = {
    PLC: ["PLC"],
    IFMS: ["IFMS"],
    CAM: ["CAM"],
    "PLC+IFMS": ["PLC", "IFMS"],
    "PLC+CAM": ["PLC", "CAM"],
    "IFMS+CAM": ["IFMS", "CAM"],
    ALL: ["PLC", "IFMS", "CAM"],
  };
  const heads = CHARGE_HEAD_OPTIONS.map((o) => o.value);
  const pairs = heads.flatMap((a) => heads.map((b) => [a, b] as const));
  it.each(pairs)("charges %s + %s on two rows", (a, b) => {
    const overlaps = CHARGES_OF[a].some((c) => CHARGES_OF[b].includes(c));
    const errors = validatePlanForm(
      validForm({
        instalments: [
          row({ key: 1, percent: "10", chargeHead: a }),
          row({ key: 2, percent: "90", chargeHead: b }),
        ],
      }),
      []
    );
    expect(Boolean(errors.chargeHeads)).toBe(overlaps);
  });

  it("allows one pair plus the remaining single charge, and catches three-row overlaps", () => {
    const ok = validForm({
      instalments: [
        row({ key: 1, percent: "10" }),
        row({ key: 2, percent: "40", chargeHead: "PLC+IFMS" }),
        row({ key: 3, percent: "50", chargeHead: "CAM" }),
      ],
    });
    expect(validatePlanForm(ok, [])).toEqual({});
    const bad = validForm({
      instalments: [
        row({ key: 1, percent: "10", chargeHead: "PLC" }),
        row({ key: 2, percent: "40", chargeHead: "IFMS+CAM" }),
        row({ key: 3, percent: "50", chargeHead: "CAM" }),
      ],
    });
    expect(validatePlanForm(bad, []).chargeHeads).toMatch(/only one instalment/);
  });
});

// ---------------------------------------------------------------------------
// Payload
// ---------------------------------------------------------------------------

describe("buildPlanPayload", () => {
  it("places a new plan after the existing ones and caps the order at 1000", () => {
    expect(buildPlanPayload(validForm(), plansWithSortOrders([3, 1, 7])).sort_order).toBe(8);
    expect(buildPlanPayload(validForm(), plansWithSortOrders([1000])).sort_order).toBe(1000);
    expect(buildPlanPayload(validForm(), plansWithSortOrders([0])).sort_order).toBe(1);
  });

  it("omits sort_order when the plan list did not load (backend default 0)", () => {
    expect(buildPlanPayload(validForm(), [])).not.toHaveProperty("sort_order");
  });

  it("sends due_from only for custom events", () => {
    const payload = buildPlanPayload(
      validForm({
        instalments: [
          row({ key: 1, percent: "10", countedFrom: "Booking date" }),
          row({ key: 2, percent: "40", countedFrom: "Offer of Possession date" }),
          row({ key: 3, percent: "50", countedFrom: "  Completion   of plinth ", dueDays: "30" }),
        ],
      }),
      []
    );
    expect(payload.instalments[0]).not.toHaveProperty("due_from");
    expect(payload.instalments[1]).not.toHaveProperty("due_from");
    expect(payload.instalments[2]).toMatchObject({
      due_trigger: "custom",
      due_days: 30,
      due_from: "Completion of plinth",
    });
  });

  it("sends the booking amount's own days instead of forcing 0", () => {
    const payload = buildPlanPayload(
      validForm({ instalments: [row({ key: 1, percent: "100", dueDays: "7" })] }),
      []
    );
    expect(payload.instalments[0]).toMatchObject({ due_trigger: "booking", due_days: 7 });
  });

  it("sends blank description / project as null and charge pairs verbatim", () => {
    const payload = buildPlanPayload(
      validForm({
        description: "   ",
        projectId: " ",
        instalments: [row({ key: 1, percent: "100", chargeHead: "IFMS+CAM" })],
      }),
      []
    );
    expect(payload.description).toBeNull();
    expect(payload.project_id).toBeNull();
    expect(payload.instalments[0].charge_head).toBe("IFMS+CAM");
  });
});

describe("needsBackendUpdate", () => {
  const base = (instalments: PaymentPlanCreatePayload["instalments"]): PaymentPlanCreatePayload => ({
    code: "X1",
    short_code: "X1",
    name: "X plan",
    instalments,
  });
  const std = { label: "a", percent: 50, due_trigger: "booking" as const, due_days: 0, charge_head: null };

  it("is false for plans today's backend accepts", () => {
    expect(needsBackendUpdate(base([std, { ...std, due_days: 60, charge_head: "ALL" }]))).toBe(false);
    expect(needsBackendUpdate(base([std, { ...std, due_trigger: "possession", charge_head: "CAM" }]))).toBe(false);
  });

  it.each([
    ["a custom event", [std, { ...std, due_trigger: "custom" as const, due_from: "Plinth" }]],
    ["a charge pair", [std, { ...std, charge_head: "PLC+IFMS" as const }]],
    ["booking amount due later", [{ ...std, due_days: 7 }, std]],
    ["booking amount counted from possession", [{ ...std, due_trigger: "possession" as const }, std]],
  ])("is true for %s", (_, instalments) => {
    expect(needsBackendUpdate(base(instalments))).toBe(true);
  });
});

describe("planSubmitErrorMessage", () => {
  const standard = buildPlanPayload(validForm(), []);
  const custom = buildPlanPayload(
    validForm({
      instalments: [row({ key: 1, percent: "10" }), row({ key: 2, percent: "90", countedFrom: "Completion of plinth" })],
    }),
    []
  );

  it("explains the pending server update when an updated-backend plan is rejected as invalid", () => {
    expect(planSubmitErrorMessage(new ApiError(422, "Validation error"), custom)).toBe(NEEDS_BACKEND_UPDATE_MESSAGE);
    expect(planSubmitErrorMessage(new ApiError(400, "x", "invalid_payment_plan"), custom)).toBe(
      NEEDS_BACKEND_UPDATE_MESSAGE
    );
    expect(planSubmitErrorMessage(new ApiError(400, "x", "invalid_instalments"), custom)).toBe(
      NEEDS_BACKEND_UPDATE_MESSAGE
    );
  });

  it("keeps the normal messages for standard plans and for unrelated errors", () => {
    expect(planSubmitErrorMessage(new ApiError(400, "x", "invalid_payment_plan"), standard)).toBe(
      API_ERROR_MESSAGES.invalid_payment_plan
    );
    expect(planSubmitErrorMessage(new ApiError(409, "x", "payment_plan_exists"), custom)).toBe(
      API_ERROR_MESSAGES.payment_plan_exists
    );
    expect(planSubmitErrorMessage(new ApiError(422, "Field required"), standard)).toBe("Field required");
    expect(planSubmitErrorMessage(new TypeError("Failed to fetch"), custom)).toBe(GENERIC_ERROR_MESSAGE);
  });
});

// ---------------------------------------------------------------------------
// Shared contract with the backend integration test
// ---------------------------------------------------------------------------

describe("backend contract: accepted plans", () => {
  it.each(contract.accepted.map((c) => [c.name, c] as const))("%s", (_, c) => {
    const values = toFormValues(c.form);
    const existing = plansWithSortOrders(c.existingSortOrders);

    expect(validatePlanForm(values, existing)).toEqual({});
    const payload = buildPlanPayload(values, existing);
    expect(payload).toEqual(c.payload);
    expect(needsBackendUpdate(payload)).toBe(c.needsBackendUpdate);
    // What the admin sees under each row is what the backend will store as due_text.
    expect(values.instalments.map(dueSummary)).toEqual(c.expect.dueTexts);
  });

  it("covers every dropdown charge option and both kinds of new due", () => {
    const sent = contract.accepted.flatMap((c) => c.payload.instalments);
    const heads = new Set(sent.map((r) => r.charge_head).filter(Boolean));
    expect([...heads].sort()).toEqual(CHARGE_HEAD_OPTIONS.map((o) => o.value).sort());
    expect(sent.some((r) => r.due_trigger === "custom")).toBe(true);
    expect(contract.accepted.some((c) => c.payload.instalments[0].due_days !== 0)).toBe(true);
    expect(contract.accepted.some((c) => c.payload.instalments[0].due_trigger === "custom")).toBe(true);
  });
});

describe("backend contract: rejected plans are blocked before sending", () => {
  it.each(contract.rejected.map((c) => [c.name, c] as const))("%s", (_, c) => {
    const values = toFormValues(c.form);
    const existing = plansWithSortOrders(c.existingSortOrders);
    const errors = validatePlanForm(values, existing);
    for (const key of c.frontendErrorKeys) expect(errors).toHaveProperty(key);
    // The backend test sends this payload directly, to prove the server refuses it too.
    expect(buildPlanPayload(values, existing)).toEqual(c.payload);
  });
});
