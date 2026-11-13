import { describe, expect, it, vi } from "vitest";
import { ApiError, type ApiCustomer, type ApiPaymentPlan } from "../../lib/api";
import { parseCsv } from "../../lib/csv";
import {
  date,
  fetchAllPages,
  importErrorIssues,
  phone,
  readImportFile,
  sampleCsv,
  sectionCsv,
  time,
} from "./csvModel";
import { customersCsv, parseChargeHead, paymentPlansCsv, planCsvRows, visitsCsv } from "./sections";

const customer = (overrides: Partial<ApiCustomer> = {}): ApiCustomer => ({
  id: "c1",
  full_name: "Arjun Mehta",
  email: "arjun@example.com",
  phone: "+91 98765 43210",
  source: "WEBSITE",
  status: "LEAD",
  created_at: "2026-11-01T10:00:00Z",
  last_activity_at: "2026-11-02T10:00:00Z",
  ...overrides,
});

describe("cell parsers", () => {
  it("accepts the date formats Excel writes and rejects impossible dates", () => {
    expect(date("2026-11-20")).toEqual({ value: "2026-11-20" });
    expect(date("20/11/2026")).toEqual({ value: "2026-11-20" });
    expect(date("5-1-2026")).toEqual({ value: "2026-01-05" });
    expect(date("31-02-2026")).toHaveProperty("error");
  });

  it("accepts 24-hour and 12-hour times", () => {
    expect(time("9:05")).toEqual({ value: "09:05" });
    expect(time("16:30:00")).toEqual({ value: "16:30" });
    expect(time("12:15 AM")).toEqual({ value: "00:15" });
    expect(time("4:30 pm")).toEqual({ value: "16:30" });
    expect(time("13:00 PM")).toHaveProperty("error");
  });

  it("explains a phone number Excel turned into scientific notation", () => {
    expect(phone("9.19877E+11")).toEqual({ error: expect.stringContaining("Format the column as Text") });
  });
});

describe("customers", () => {
  it("re-imports its own export: read-only columns are ignored and IDs mean update", () => {
    const read = readImportFile(sectionCsv(customersCsv, [customer()]), customersCsv);
    expect(read.issues).toEqual([]);
    expect(read.ignored).toEqual([]);
    expect(read.items).toEqual([
      { row: 2, id: "c1", full_name: "Arjun Mehta", email: "arjun@example.com", phone: "+91 98765 43210" },
    ]);
  });

  it("sample has only the import columns, and imports as a new customer", () => {
    const sample = sampleCsv(customersCsv);
    expect(parseCsv(sample)[0]).toEqual(["ID", "Full Name", "Email", "Phone"]);
    const read = readImportFile(sample, customersCsv);
    expect(read.issues).toEqual([]);
    expect(read.items[0]).not.toHaveProperty("id");
  });

  it("matches headers loosely and reports each bad cell by spreadsheet row", () => {
    const file = [
      "full_name,EMAIL , phone,Notes",
      "Arjun,arjun@example.com,98765",
      "",
      "Neha,not-an-email,98111",
      "Ravi,ARJUN@example.com,",
    ].join("\n");
    const read = readImportFile(file, customersCsv);
    expect(read.ignored).toEqual(["Notes"]);
    expect(read.issues).toEqual([
      { row: 4, column: "Email", message: "Not a valid email address." },
      { row: 5, column: "Email", message: "Same Email as row 2." },
      { row: 5, column: "Phone", message: "Phone is required." },
    ]);
  });

  it("lets an update leave required cells blank", () => {
    const read = readImportFile("ID,Full Name,Email,Phone\nc1,,,99999", customersCsv);
    expect(read.issues).toEqual([]);
    expect(read.items).toEqual([{ row: 2, id: "c1", phone: "99999" }]);
  });

  it("refuses a file missing a required column", () => {
    const read = readImportFile("Full Name,Phone\nArjun,1", customersCsv);
    expect(read.items).toEqual([]);
    expect(read.issues[0].message).toMatch(/^Missing column: Email\./);
  });

  it("refuses empty and header-only files", () => {
    expect(readImportFile("\n\n", customersCsv).issues[0].message).toBe("The file is empty.");
    expect(readImportFile("Full Name,Email,Phone\n", customersCsv).issues[0].message).toMatch(/no rows/);
  });
});

describe("site visits", () => {
  it("normalises labels, dates and times to API values", () => {
    const file = "Type,Customer Name,Project,Visit Date,Visit Time,Status\nchannel partner,Neha,Suraksha Enclave,20/11/2026,4:30 PM,Follow Up";
    const read = readImportFile(file, visitsCsv);
    expect(read.issues).toEqual([]);
    expect(read.items[0]).toEqual({
      row: 2,
      origin_type: "CHANNEL_PARTNER",
      customer_name: "Neha",
      project_name: "suraksha-enclave",
      visit_date: "2026-11-20",
      visit_time: "16:30",
      status: "follow_up",
    });
  });
});

describe("payment plans", () => {
  const existing: ApiPaymentPlan[] = [
    { code: "PP1/FPP", short_code: "PP1", name: "Flexi", description: null, project_id: null, version: 1, is_active: true, sort_order: 3 },
  ];
  const section = paymentPlansCsv(existing);
  const header = "Plan Code,Short Code,Plan Name,Instalment,Percent,Counted From,Days Later,Charges";

  it("groups rows by plan code into the same payload the Add Plan form sends", () => {
    const file = [
      header,
      "PP5/X,PP5,Five,Booking amount,10%,Booking date,0,",
      "PP6/Y,PP6,Six,All at once,100,Booking date,,All",
      "pp5/x,,,On possession,90,Offer of Possession date,15,PLC + IFMS",
    ].join("\n");
    const read = readImportFile(file, section);
    expect(read.issues).toEqual([]);
    expect(read.items).toEqual([
      {
        row: 2,
        code: "PP5/X",
        short_code: "PP5",
        name: "Five",
        description: null,
        project_id: null,
        sort_order: 4,
        instalments: [
          { label: "Booking amount", percent: 10, due_trigger: "booking", due_days: 0, charge_head: null },
          { label: "On possession", percent: 90, due_trigger: "possession", due_days: 15, charge_head: "PLC+IFMS" },
        ],
      },
      expect.objectContaining({ row: 3, code: "PP6/Y", sort_order: 5 }),
    ]);
  });

  it("reports plan rule failures on the right rows", () => {
    const file = [
      header,
      "PP1/FPP,PP9,Dup,Booking,50,Booking date,0,PLC",
      "PP1/FPP,PP8,Dup,Rest,40,Booking date,abc,PLC",
      "PP7/Z,PP1,Seven,All,100,Booking date,0,XYZ",
    ].join("\n");
    const messages = readImportFile(file, section).issues.map((i) => `${i.row}|${i.column ?? ""}|${i.message}`);
    expect(messages).toEqual(
      expect.arrayContaining([
        "3|Short Code|Differs from row 2 of plan PP1/FPP. Repeat the same value, or leave it blank.",
        "2|Plan Code|A plan with this code already exists.",
        "3|Days Later|Whole days, 0 to 3650.",
      ])
    );
    expect(messages.some((m) => m.startsWith("2|Charges|Each charge (PLC, IFMS, CAM) can be added to only one"))).toBe(true);
    expect(messages.some((m) => m.startsWith("2||Plan PP1/FPP: Instalment percentages must add up to 100%"))).toBe(true);
    expect(messages).toContain("4|Charges|Use PLC, IFMS, CAM, two of them joined with + (e.g. PLC + IFMS), or All.");
    expect(messages).toContain("4|Short Code|An active plan already uses this short code.");
  });

  it("exports one row per instalment and its sample imports cleanly", () => {
    const plan: ApiPaymentPlan = {
      ...existing[0],
      plots_count: 2,
      instalments: [
        { seq: 1, label: "Booking", percent: 100, due_trigger: "custom", due_days: 5, due_from: "Plinth", due_text: "5 days after Plinth", charge_head: "ALL" },
      ],
    };
    const rows = parseCsv(sectionCsv(section, planCsvRows([plan], [plan, { ...plan, version: 2, plots_count: 3 }])));
    expect(rows[1]).toEqual(["PP1/FPP", "PP1", "Flexi", "", "", "1", "Yes", "5", "Booking", "100", "Plinth", "5", "ALL", "5 days after Plinth"]);
    const sample = readImportFile(sampleCsv(section), section);
    expect(sample.issues).toEqual([]);
    expect(sample.items).toHaveLength(1);
  });

  it("reads charge heads written any reasonable way", () => {
    expect(parseChargeHead("ifms + plc")).toBe("PLC+IFMS");
    expect(parseChargeHead("All (PLC + IFMS + CAM)")).toBe("ALL");
    expect(parseChargeHead("CAM,IFMS,PLC")).toBe("ALL");
    expect(parseChargeHead("PLC+PLC")).toBeNull();
    expect(parseChargeHead("")).toBe("");
  });
});

describe("importErrorIssues", () => {
  const items = [{ row: 2 }, { row: 7 }];

  it("maps the server's row errors and FastAPI's body errors to rows and headers", () => {
    const rowErr = new ApiError(422, "2 rows", "import_invalid");
    rowErr.detail = { code: "import_invalid", errors: [{ row: 7, field: "email", message: "Already registered." }] };
    expect(importErrorIssues(rowErr, items, customersCsv)).toEqual([{ row: 7, column: "Email", message: "Already registered." }]);

    const dtoErr = new ApiError(422, "bad", "value_error", [{ type: "value_error", loc: ["body", "rows", 1, "phone"], msg: "too long" }]);
    expect(importErrorIssues(dtoErr, items, customersCsv)).toEqual([{ row: 7, column: "Phone", message: "too long" }]);
  });

  it("explains a backend without the import endpoint and network failures", () => {
    expect(importErrorIssues(new ApiError(404, "Not Found"), items, customersCsv)[0].message).toMatch(/server update/);
    expect(importErrorIssues(new TypeError("fetch"), items, customersCsv)[0].message).toMatch(/never imported twice/);
  });
});

describe("fetchAllPages", () => {
  it("loads every page in order, a few at a time", async () => {
    let inFlight = 0;
    let peak = 0;
    const fetchPage = vi.fn(async (page: number) => {
      peak = Math.max(peak, ++inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight--;
      return { items: [page * 10, page * 10 + 1], pagination: { total_pages: 9 } };
    });
    const progress = vi.fn();
    const rows = await fetchAllPages(fetchPage, progress);
    expect(rows).toEqual(Array.from({ length: 9 }, (_, i) => [(i + 1) * 10, (i + 1) * 10 + 1]).flat());
    expect(fetchPage).toHaveBeenCalledWith(1, 100);
    expect(peak).toBeLessThanOrEqual(4);
    expect(progress).toHaveBeenLastCalledWith(9, 9);
  });

  it("retries a transient failure but not a refused request", async () => {
    vi.useFakeTimers();
    try {
      const flaky = vi.fn().mockRejectedValueOnce(new TypeError("network")).mockResolvedValue({ items: [1] });
      const result = fetchAllPages(flaky);
      await vi.runAllTimersAsync();
      await expect(result).resolves.toEqual([1]);

      const refused = vi.fn().mockRejectedValue(new ApiError(403, "Forbidden"));
      await expect(fetchAllPages(refused)).rejects.toThrow("Forbidden");
      expect(refused).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops when aborted", async () => {
    const controller = new AbortController();
    const fetchPage = vi.fn(async (page: number) => {
      if (page === 1) controller.abort();
      return { items: [page], pagination: { total_pages: 50 } };
    });
    await expect(fetchAllPages(fetchPage, undefined, controller.signal)).rejects.toThrow();
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });
});
