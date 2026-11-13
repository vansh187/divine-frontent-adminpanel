/**
 * The CSV layout of every section. Import rules mirror the backend contract in
 * docs/csv-import-backend.md. Bookings, refunds and revenue are export-only: those
 * records come from the payment and KYC flows, which keep their audit trail.
 */
import type {
  ApiBookingListItem,
  ApiBroker,
  ApiCustomer,
  ApiInventoryExportRow,
  ApiPaymentPlan,
  ApiPlanInstalment,
  ApiRefundListItem,
  ApiRevenueTransaction,
  ApiVisit,
  PlanChargeHead,
} from "../../lib/api";
import { titleCase } from "../../lib/format";
import { inventoryStatusLabel } from "../inventory/inventoryLabels";
import {
  BOOKING_DATE,
  DESCRIPTION_MAX,
  MAX_INSTALMENTS,
  POSSESSION_DATE,
  blankInstalment,
  buildPlanPayload,
  validatePlanForm,
  type PlanFormValues,
} from "../paymentPlans/planForm";
import {
  date,
  email,
  oneOf,
  phone,
  text,
  time,
  type BuiltImport,
  type CsvSection,
  type ImportItem,
  type ImportRecord,
  type RowIssue,
} from "./csvModel";

const label = (labels: Record<string, string>, value: string | null | undefined) =>
  value ? (labels[value] ?? titleCase(value)) : "";

/**
 * A timestamp as "2026-11-01 16:00" in the admin's own time zone (IST for the team):
 * Excel reads this as a date-time, while ISO "2026-11-01T10:30:00Z" stays text and is in UTC.
 */
export function stamp(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const PROJECTS: Record<string, string> = {
  "suraksha-enclave": "Suraksha Enclave",
  "ops-divine-greens": "Ops Divine Greens",
};

const CUSTOMER_SOURCES: Record<string, string> = {
  WEBSITE: "Website",
  BROKER_CHANNEL: "Channel Partner",
  OFFLINE_IMPORT: "Offline Import",
};

const PAYMENT_METHODS: Record<string, string> = {
  razorpay: "Razorpay",
  zoho: "Zoho Payments",
  cash: "Cash",
  rtgs_neft: "RTGS/NEFT",
};

const VISIT_TYPES: Record<string, string> = { CUSTOMER: "Customer", CHANNEL_PARTNER: "Channel Partner" };

const VISIT_STATUSES: Record<string, string> = Object.fromEntries(
  ["requested", "scheduled", "confirmed", "completed", "follow_up", "no_show", "converted", "cancelled"].map((s) => [
    s,
    titleCase(s),
  ])
);

const id = text(64);
const fullName = text(200, 2);

export const customersCsv: CsvSection<ApiCustomer> = {
  file: "customers",
  noun: "customers",
  key: (c) => c.id,
  columns: [
    { header: "ID", value: (c) => c.id, field: "id", unique: true, parse: id },
    { header: "Full Name", value: (c) => c.full_name, field: "full_name", required: true, parse: fullName },
    { header: "Email", value: (c) => c.email, field: "email", required: true, unique: true, parse: email },
    { header: "Phone", value: (c) => c.phone, field: "phone", required: true, parse: phone },
    { header: "Source", value: (c) => label(CUSTOMER_SOURCES, c.source) },
    { header: "Status", value: (c) => titleCase(c.status) },
    { header: "Created At", value: (c) => stamp(c.created_at) },
    { header: "Last Activity", value: (c) => stamp(c.last_activity_at) },
  ],
  sample: [
    {
      id: "",
      full_name: "Arjun Mehta",
      email: "arjun.mehta@example.com",
      phone: "+91 98765 43210",
      source: "WEBSITE",
      status: "LEAD",
      created_at: "",
      last_activity_at: "",
    },
  ],
  import: {
    entity: "customers",
    help: "Rows without an ID are added as new leads (source Website). Rows with an ID update that customer's name, email and phone; blank cells leave a value unchanged.",
  },
};

export const brokersCsv: CsvSection<ApiBroker> = {
  file: "channel-partners",
  noun: "channel partners",
  key: (b) => b.id,
  columns: [
    { header: "ID", value: (b) => b.id, field: "id", unique: true, parse: id },
    { header: "Full Name", value: (b) => b.full_name, field: "full_name", required: true, parse: fullName },
    { header: "Email", value: (b) => b.email, field: "email", required: true, unique: true, parse: email },
    { header: "Phone", value: (b) => b.phone, field: "phone", required: true, parse: phone },
    { header: "Project", value: (b) => label(PROJECTS, b.project), field: "project", required: true, parse: oneOf(PROJECTS) },
    { header: "Created At", value: (b) => stamp(b.created_at) },
    { header: "Last Activity", value: (b) => stamp(b.last_activity_at) },
  ],
  sample: [
    {
      id: "",
      full_name: "Neha Realty",
      email: "neha.realty@example.com",
      phone: "+91 98111 22334",
      project: "suraksha-enclave",
      created_at: "",
      last_activity_at: "",
    },
  ],
  import: {
    entity: "brokers",
    help: "Rows without an ID add a channel partner. Rows with an ID update that partner's details; blank cells leave a value unchanged.",
  },
};

export const visitsCsv: CsvSection<ApiVisit> = {
  file: "site-visits",
  noun: "site visits",
  key: (v) => v.id,
  columns: [
    { header: "ID", value: (v) => v.id, field: "id", unique: true, parse: id },
    { header: "Type", value: (v) => label(VISIT_TYPES, v.origin_type), field: "origin_type", required: true, parse: oneOf(VISIT_TYPES) },
    { header: "Customer Name", value: (v) => v.customer_name, field: "customer_name", required: true, parse: fullName },
    { header: "Contact", value: (v) => v.customer_contact, field: "customer_contact", parse: phone },
    { header: "Email", value: (v) => v.customer_email, field: "customer_email", parse: email },
    { header: "Project", value: (v) => label(PROJECTS, v.project_name), field: "project_name", parse: oneOf(PROJECTS) },
    { header: "Plot", value: (v) => v.plot_number, field: "plot_number", parse: text(50) },
    { header: "Source", value: (v) => v.source, field: "source", parse: text(100) },
    { header: "Assigned To", value: (v) => v.assigned_to, field: "assigned_to", parse: text(100) },
    { header: "Preferred Window", value: (v) => v.preferred_window, field: "preferred_window", parse: text(100) },
    { header: "Visit Date", value: (v) => v.visit_date, field: "visit_date", parse: date },
    { header: "Visit Time", value: (v) => v.visit_time, field: "visit_time", parse: time },
    { header: "Status", value: (v) => label(VISIT_STATUSES, v.status), field: "status", parse: oneOf(VISIT_STATUSES) },
    { header: "Notes", value: (v) => v.notes, field: "notes", parse: text(2000) },
    { header: "Created At", value: (v) => stamp(v.created_at) },
  ],
  sample: [
    {
      id: "",
      origin_type: "CUSTOMER",
      customer_name: "Arjun Mehta",
      customer_contact: "+91 98765 43210",
      customer_email: "arjun.mehta@example.com",
      project_name: "suraksha-enclave",
      plot_number: "A-12",
      source: "Website",
      assigned_to: "Rahul",
      preferred_window: "Weekend morning",
      visit_date: "2026-11-20",
      visit_time: "11:00",
      status: "scheduled",
      notes: "Wants a corner plot",
      created_at: "",
      last_activity_at: "",
    },
  ],
  import: {
    entity: "visits",
    help: "Rows without an ID add a site visit (status Scheduled if blank, or Requested when there is no visit date). Rows with an ID update that visit; blank cells leave a value unchanged.",
  },
};

export const bookingsCsv: CsvSection<ApiBookingListItem> = {
  file: "bookings",
  noun: "bookings",
  key: (b) => b.id,
  columns: [
    { header: "Booking ID", value: (b) => b.id },
    { header: "Customer ID", value: (b) => b.customer_id },
    { header: "Customer", value: (b) => b.customer_name },
    { header: "Project", value: (b) => b.project_name },
    { header: "Unit", value: (b) => b.unit_number },
    { header: "Amount", value: (b) => b.amount },
    { header: "KYC Status", value: (b) => titleCase(b.kyc_status) },
    { header: "Booking Status", value: (b) => titleCase(b.status) },
    { header: "Created At", value: (b) => stamp(b.created_at) },
    { header: "Last Activity", value: (b) => stamp(b.last_activity_at) },
  ],
  sample: [
    {
      id: "BK-1001",
      customer_id: "CUS-2001",
      customer_name: "Arjun Mehta",
      project_name: "Suraksha Enclave",
      unit_number: "A-12",
      amount: 250000,
      status: "pending_kyc_review",
      kyc_status: "pending",
      version: 1,
      created_at: "2026-11-01T10:30:00Z",
      last_activity_at: "2026-11-02T09:00:00Z",
    },
  ],
};

export const refundsCsv: CsvSection<ApiRefundListItem> = {
  file: "refunds",
  noun: "refunds",
  key: (r) => r.id,
  columns: [
    { header: "Payment ID", value: (r) => r.id },
    { header: "Booking ID", value: (r) => r.booking_id },
    { header: "Customer ID", value: (r) => r.customer_id },
    { header: "Customer", value: (r) => r.customer_name },
    { header: "Project", value: (r) => r.project_name },
    { header: "Unit", value: (r) => r.unit_number },
    { header: "Amount", value: (r) => r.amount },
    { header: "Currency", value: (r) => r.currency },
    { header: "Method", value: (r) => label(PAYMENT_METHODS, r.method) },
    { header: "Status", value: (r) => titleCase(r.status) },
    { header: "Initiated", value: (r) => stamp(r.refund_initiated_date) },
    { header: "Completed", value: (r) => stamp(r.refund_completed_date) },
  ],
  sample: [
    {
      id: "PAY-3001",
      booking_id: "BK-1001",
      customer_id: "CUS-2001",
      customer_name: "Arjun Mehta",
      project_name: "Suraksha Enclave",
      unit_number: "A-12",
      amount: 250000,
      currency: "INR",
      method: "rtgs_neft",
      status: "bank_transfer_pending",
      refund_initiated_date: "2026-11-05T12:00:00Z",
      refund_completed_date: null,
    },
  ],
};

export const revenueCsv: CsvSection<ApiRevenueTransaction> = {
  file: "revenue-transactions",
  noun: "transactions",
  key: (t) => t.transaction_id,
  columns: [
    { header: "Transaction ID", value: (t) => t.transaction_id },
    { header: "Booking ID", value: (t) => t.booking_id },
    { header: "Customer ID", value: (t) => t.customer_id },
    { header: "Customer", value: (t) => t.customer_name },
    { header: "Project", value: (t) => t.project_name },
    { header: "Unit", value: (t) => t.unit_number },
    { header: "Amount", value: (t) => t.amount },
    { header: "Currency", value: (t) => t.currency },
    { header: "Method", value: (t) => label(PAYMENT_METHODS, t.method) },
    { header: "Status", value: (t) => titleCase(t.status) },
    { header: "Date", value: (t) => stamp(t.created_at) },
  ],
  sample: [
    {
      transaction_id: "PAY-3002",
      booking_id: "BK-1001",
      customer_id: "CUS-2001",
      customer_name: "Arjun Mehta",
      project_name: "Suraksha Enclave",
      unit_number: "A-12",
      amount: 250000,
      currency: "INR",
      method: "razorpay",
      status: "captured",
      created_at: "2026-11-01T10:30:00Z",
    },
  ],
};

// ---------------------------------------------------------------------------
// Payment plans: one row per instalment; the plan's details repeat on each row.
// ---------------------------------------------------------------------------

export interface PlanCsvRow {
  plan: ApiPaymentPlan;
  /** Null for a stored plan that failed validation and has no instalments. */
  instalment: ApiPlanInstalment | null;
  /** Plots on the plan code over all its versions; null until the backend sends counts. */
  plots: number | null;
}

/** Export rows for the plans shown on the page (`current`), counting plots over `all` versions. */
export function planCsvRows(current: ApiPaymentPlan[], all: ApiPaymentPlan[]): PlanCsvRow[] {
  return current.flatMap((plan) => {
    const counts = all.filter((p) => p.code === plan.code && typeof p.plots_count === "number");
    const plots = counts.length ? counts.reduce((sum, p) => sum + (p.plots_count as number), 0) : null;
    const instalments = plan.instalments?.length ? plan.instalments : [null];
    return instalments.map((instalment) => ({ plan, instalment, plots }));
  });
}

function countedFrom(i: ApiPlanInstalment | null) {
  if (!i) return "";
  if (i.due_trigger === "booking") return BOOKING_DATE;
  if (i.due_trigger === "possession") return POSSESSION_DATE;
  return i.due_from ?? i.due_text;
}

const CHARGES = ["PLC", "IFMS", "CAM"];

/** "PLC + IFMS", "ifms+plc", "All (PLC + IFMS + CAM)" -> a charge head; null if not one. */
export function parseChargeHead(raw: string): PlanChargeHead | "" | null {
  const value = raw.toUpperCase().replace(/\s+/g, "");
  if (!value || ["-", "NONE", "NA", "N/A", "NIL", "NO"].includes(value)) return "";
  if (value.startsWith("ALL")) return "ALL";
  const parts = value.split(/[+,&/]|AND/).filter(Boolean);
  if (parts.length === 0 || parts.some((p) => !CHARGES.includes(p)) || new Set(parts).size !== parts.length) return null;
  if (parts.length === 3) return "ALL";
  return CHARGES.filter((c) => parts.includes(c)).join("+") as PlanChargeHead;
}

const H = {
  code: "Plan Code",
  shortCode: "Short Code",
  name: "Plan Name",
  description: "Description",
  projectId: "Project ID",
  label: "Instalment",
  percent: "Percent",
  countedFrom: "Counted From",
  dueDays: "Days Later",
  charges: "Charges",
} as const;

const PLAN_LEVEL = [H.shortCode, H.name, H.description, H.projectId];

// validatePlanForm keys -> the column they belong to.
const PLAN_ERROR_COLUMNS: Record<string, string> = {
  code: H.code,
  shortCode: H.shortCode,
  name: H.name,
  projectId: H.projectId,
  label: H.label,
  percent: H.percent,
  from: H.countedFrom,
  days: H.dueDays,
  chargeHeads: H.charges,
};

function buildPlans(records: ImportRecord[], existing: ApiPaymentPlan[]): BuiltImport {
  const issues: RowIssue[] = [];
  const groups = new Map<string, ImportRecord[]>();
  for (const record of records) {
    const code = record.cells[H.code];
    if (!code) {
      issues.push({ row: record.row, column: H.code, message: `${H.code} is required on every row.` });
      continue;
    }
    const key = code.toLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }

  const known = [...existing];
  const items: ImportItem[] = [];
  for (const group of groups.values()) {
    const first = group[0];
    const code = first.cells[H.code];
    const planIssues: RowIssue[] = [];
    const add = (row: number, column: string | undefined, message: string) => planIssues.push({ row, column, message });

    // Plan details may be on any row of the plan (usually the first); the rest repeat them or leave them blank.
    const sourceRow = new Map<string, ImportRecord>();
    for (const column of PLAN_LEVEL) {
      const source = group.find((r) => r.cells[column]);
      if (!source) continue;
      sourceRow.set(column, source);
      for (const record of group)
        if (record.cells[column] && record.cells[column] !== source.cells[column])
          add(record.row, column, `Differs from row ${source.row} of plan ${code}. Repeat the same value, or leave it blank.`);
    }
    const planValue = (column: string) => sourceRow.get(column)?.cells[column] ?? "";
    const rowOf = (column: string | undefined) => (column && sourceRow.get(column)?.row) || first.row;

    if (group.length > MAX_INSTALMENTS) add(first.row, undefined, `Plan ${code} has ${group.length} instalments; the maximum is ${MAX_INSTALMENTS}.`);
    if (planValue(H.description).length > DESCRIPTION_MAX)
      add(rowOf(H.description), H.description, `Max ${DESCRIPTION_MAX} characters.`);

    const values: PlanFormValues = {
      code,
      shortCode: planValue(H.shortCode),
      name: planValue(H.name),
      description: planValue(H.description),
      projectId: planValue(H.projectId),
      instalments: group.map((record) => {
        const chargeHead = parseChargeHead(record.cells[H.charges]);
        if (chargeHead === null) add(record.row, H.charges, "Use PLC, IFMS, CAM, two of them joined with + (e.g. PLC + IFMS), or All.");
        return blankInstalment({
          key: record.row,
          label: record.cells[H.label],
          percent: record.cells[H.percent].replace(/%$/, "").trim(),
          countedFrom: record.cells[H.countedFrom],
          dueDays: record.cells[H.dueDays],
          chargeHead: chargeHead ?? "",
        });
      }),
    };

    // Same rules as the Add Payment Plan form. Row-level keys end in "-<row number>".
    for (const [key, message] of Object.entries(validatePlanForm(values, known))) {
      const match = /^(\w+)-(\d+)$/.exec(key);
      const column = PLAN_ERROR_COLUMNS[match ? match[1] : key];
      if (match) add(Number(match[2]), column, message);
      else if (key === "code" && existing.some((p) => p.code.toLowerCase() === code.toLowerCase()))
        add(first.row, column, "A plan with this code already exists. Import only adds new plans: use a new Plan Code.");
      else add(rowOf(column), column, column ? message : `Plan ${code}: ${message}`);
    }

    if (planIssues.length > 0) {
      issues.push(...planIssues);
      continue;
    }
    const payload = buildPlanPayload(values, known);
    items.push({ row: first.row, ...payload });
    // Later plans in the file are checked against this one too (codes, short codes, order).
    known.push({
      code: payload.code,
      short_code: payload.short_code,
      name: payload.name,
      description: null,
      project_id: null,
      version: 1,
      is_active: true,
      sort_order: payload.sort_order,
    });
  }
  return { items, issues };
}

const planColumn = (header: string, field: string, value: (r: PlanCsvRow) => string | number | null | undefined, required = false) => ({
  header,
  field,
  required,
  value,
});

/** `existing` is every plan version on the server, for duplicate code / short code checks. */
export function paymentPlansCsv(existing: ApiPaymentPlan[]): CsvSection<PlanCsvRow> {
  return {
    file: "payment-plans",
    noun: "payment plans",
    key: (r) => `${r.plan.code}\u0000${r.plan.version}\u0000${r.instalment?.seq ?? 0}`,
    columns: [
      planColumn(H.code, "code", (r) => r.plan.code, true),
      planColumn(H.shortCode, "short_code", (r) => r.plan.short_code, true),
      planColumn(H.name, "name", (r) => r.plan.name, true),
      planColumn(H.description, "description", (r) => r.plan.description),
      planColumn(H.projectId, "project_id", (r) => r.plan.project_id),
      { header: "Version", value: (r) => r.plan.version },
      { header: "Active", value: (r) => (r.plan.is_active ? "Yes" : "No") },
      { header: "Plots Using Plan", value: (r) => r.plots },
      planColumn(H.label, "label", (r) => r.instalment?.label, true),
      planColumn(H.percent, "percent", (r) => r.instalment?.percent, true),
      planColumn(H.countedFrom, "due_from", (r) => countedFrom(r.instalment), true),
      planColumn(H.dueDays, "due_days", (r) => r.instalment?.due_days ?? (r.instalment ? 0 : null)),
      planColumn(H.charges, "charge_head", (r) => r.instalment?.charge_head),
      { header: "Due Wording", value: (r) => r.instalment?.due_text },
    ],
    sample: planCsvRows(
      [
        {
          code: "PP5/CLP/10-40-50",
          short_code: "PP5",
          name: "Construction Linked Plan",
          description: "10% on booking, 40% at plinth, 50% on possession",
          project_id: "suraksha-enclave",
          version: 1,
          is_active: true,
          instalments: [
            { seq: 1, label: "Booking amount", percent: 10, due_trigger: "booking", due_days: 0, due_text: "", charge_head: null },
            { seq: 2, label: "On plinth", percent: 40, due_trigger: "custom", due_days: 30, due_from: "Completion of plinth", due_text: "", charge_head: "PLC" },
            { seq: 3, label: "On possession", percent: 50, due_trigger: "possession", due_days: 0, due_text: "", charge_head: "IFMS+CAM" },
          ],
        },
      ],
      []
    ),
    import: {
      entity: "payment-plans",
      help: "Adds new plans, one row per instalment: rows with the same Plan Code form one plan, in file order. New plans are active straight away. Existing plans can't be changed by import.",
      build: (records) => buildPlans(records, existing),
    },
  };
}

// ---------------------------------------------------------------------------
// Inventory: export-only. Columns in the client's sheet order; `group` is the
// heading each field is listed under when choosing what to export.
// ---------------------------------------------------------------------------

const PLOT = "Plot";
const PROJECT = "Project & Company";
const BOOKING = "Booking & Payment Plan";
const CLIENT = "Client";
const CO_APPLICANT = "Co-applicant";

const inventorySampleBase: ApiInventoryExportRow = {
  id: "sample-1",
  project_name: "Suraksha Enclave",
  city: "Ganaur",
  locality: "Sector-15",
  block: "C",
  unit_number: "C-12",
  unit_type: "plot",
  width_mtr: 7.45,
  length_mtr: 13.404,
  area_sqmt: 99.86,
  area_sqyd: 119.43,
  status: "sold",
  sale_source: "offline",
  status_note: null,
  last_changed_at: null,
  last_changed_by_name: null,
  company_name: "Rama Krishna Buildwell Pvt. Ltd.",
  company_address: "Suraksha Enclave Site Office - Village Garhi Kesri, Sector-15, Ganaur, Sonipat, Haryana",
  plot_address: "Plot No C-12, Suraksha Enclave, Sector-15, Ganaur",
  payment_plan: "PP2/CLP/10-40-50",
  client_name: "Dheeraj Nirwal",
  phone: "9876543210",
  alternative_number: "9812345678",
  email: "dheeraj@example.com",
  address: "H.No. 543, Sonipat, Haryana",
  co_applicant_email: "pooja@example.com",
  co_applicant_address: "H.No. 543, Sonipat, Haryana",
  booking_date: "2026-10-05",
};

export const inventoryCsv: CsvSection<ApiInventoryExportRow> = {
  file: "inventory",
  noun: "plots",
  key: (u) => u.id,
  columns: [
    { header: "Plot No", group: PLOT, value: (u) => u.unit_number },
    { header: "Width (Mtr.)", group: PLOT, value: (u) => u.width_mtr },
    { header: "Length (Mtr.)", group: PLOT, value: (u) => u.length_mtr },
    { header: "Area in Sq. Mtr.", group: PLOT, value: (u) => u.area_sqmt },
    { header: "Area in Sq. Yard", group: PLOT, value: (u) => u.area_sqyd },
    { header: "Plot Status", group: PLOT, value: (u) => inventoryStatusLabel(u.status) },
    { header: "Project Name", group: PROJECT, value: (u) => u.project_name },
    { header: "Company Name", group: PROJECT, value: (u) => u.company_name },
    { header: "Block", group: PLOT, value: (u) => u.block },
    { header: "Company Address", group: PROJECT, value: (u) => u.company_address },
    { header: "Payment Plan", group: BOOKING, value: (u) => u.payment_plan },
    { header: "Client Name", group: CLIENT, value: (u) => u.client_name },
    { header: "Phone", group: CLIENT, value: (u) => u.phone },
    { header: "Booking Date", group: BOOKING, value: (u) => u.booking_date },
    { header: "Alternative Number", group: CLIENT, value: (u) => u.alternative_number },
    { header: "Email ID", group: CLIENT, value: (u) => u.email },
    { header: "Co-applicant Email", group: CO_APPLICANT, value: (u) => u.co_applicant_email },
    { header: "Address", group: CLIENT, value: (u) => u.address },
    { header: "Co-applicant Address", group: CO_APPLICANT, value: (u) => u.co_applicant_address },
    { header: "Plot Address", group: PLOT, value: (u) => u.plot_address },
  ],
  sample: [
    inventorySampleBase,
    {
      ...inventorySampleBase,
      id: "sample-2",
      unit_number: "C-13",
      status: "available",
      sale_source: null,
      plot_address: "Plot No C-13, Suraksha Enclave, Sector-15, Ganaur",
      payment_plan: null,
      client_name: null,
      phone: null,
      alternative_number: null,
      email: null,
      address: null,
      co_applicant_email: null,
      co_applicant_address: null,
      booking_date: null,
    },
  ],
};
