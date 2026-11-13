/** Files admins really produce: Excel re-saves, copy-paste, title rows, leftovers from the sample. */
import { describe, expect, it } from "vitest";
import { parseCsv } from "../../lib/csv";
import { ExportTooLargeError, date, email, fetchAllPages, phone, readImportFile, sampleCsv } from "./csvModel";
import { customersCsv, parseChargeHead, paymentPlansCsv, stamp, visitsCsv } from "./sections";

describe("parsing", () => {
  it("allows spaces before an opening quote instead of splitting the field", () => {
    expect(parseCsv('a, "b,c"\n')).toEqual([["a", "b,c"]]);
  });

  it("detects tab and semicolon separators, ignoring separators inside quoted headers", () => {
    expect(parseCsv("Full Name\tEmail\nA\tb@x.com\n")).toEqual([["Full Name", "Email"], ["A", "b@x.com"]]);
    expect(parseCsv('"Name, full";Email\nA;b\n')).toEqual([["Name, full", "Email"], ["A", "b"]]);
  });

  it("finds the header below a title row", () => {
    const read = readImportFile("Customers export,,\n\nFull Name,Email,Phone\nRavi Kumar,ravi@x.com,1", customersCsv);
    expect(read.issues).toEqual([]);
    expect(read.items).toEqual([{ row: 4, full_name: "Ravi Kumar", email: "ravi@x.com", phone: "1" }]);
  });
});

describe("cells", () => {
  it("drops invisible characters pasted from web pages and chat apps", () => {
    const read = readImportFile("Full Name,Email,Phone\nRavi​ Kumar,ravi@x.com​,﻿98765", customersCsv);
    expect(read.items[0]).toMatchObject({ full_name: "Ravi Kumar", email: "ravi@x.com", phone: "98765" });
  });

  it("refuses email addresses the server would refuse", () => {
    for (const bad of ["a@x..com", "a@x.c", "a,b@x.com", "<a@x.com>", "a@x.com;b@x.com"])
      expect(email(bad), bad).toHaveProperty("error");
    expect(email("first.last+tag@sub.example.co.in")).toEqual({ value: "first.last+tag@sub.example.co.in" });
  });

  it("repairs whole numbers written as decimals, but not real decimals", () => {
    expect(phone("9876543210.0")).toEqual({ value: "9876543210" });
    expect(phone("+919876543210.00")).toEqual({ value: "+919876543210" });
    expect(phone("98765.43")).toEqual({ value: "98765.43" });
  });

  it("reads month names and two-digit years, as Excel writes in India", () => {
    expect(date("20-Nov-2026")).toEqual({ value: "2026-11-20" });
    expect(date("20 November 26")).toEqual({ value: "2026-11-20" });
    expect(date("Nov 20, 2026")).toEqual({ value: "2026-11-20" });
    expect(date("20/11/26")).toEqual({ value: "2026-11-20" });
    expect(date("29-02-2027")).toHaveProperty("error");
    expect(date("20-Xyz-2026")).toHaveProperty("error");
  });

  it("treats 'None', '-' and 'N/A' as no charges", () => {
    for (const blank of ["None", "-", "n/a", "NIL"]) expect(parseChargeHead(blank)).toBe("");
  });
});

describe("rows that would create junk records", () => {
  it("refuses the sample's example row left in the file", () => {
    const read = readImportFile(sampleCsv(visitsCsv) + ",Customer,Neha\r\n", visitsCsv);
    expect(read.issues).toEqual([{ row: 2, message: "This is the example row from the sample file. Delete it, then import." }]);
  });

  it("refuses an exact copy of an earlier row", () => {
    const read = readImportFile("Type,Customer Name,Visit Date\nCustomer,Neha,20-11-2026\ncustomer,NEHA,20-11-2026", visitsCsv);
    expect(read.issues).toEqual([{ row: 3, message: "This row is an exact copy of row 2. Delete one of them." }]);
  });
});

describe("payment plans", () => {
  it("takes plan details from whichever row of the plan has them", () => {
    const file = [
      "Plan Code,Short Code,Plan Name,Instalment,Percent,Counted From",
      "PP9/A,,,Booking,50,Booking date",
      "PP9/A,PP9,Nine,Possession,50,Offer of Possession date",
    ].join("\n");
    const read = readImportFile(file, paymentPlansCsv([]));
    expect(read.issues).toEqual([]);
    expect(read.items[0]).toMatchObject({ row: 2, short_code: "PP9", name: "Nine" });
  });

  it("reports conflicting plan details against the row that set them", () => {
    const file = [
      "Plan Code,Short Code,Plan Name,Instalment,Percent,Counted From",
      "PP9/A,PP9,Nine,Booking,50,Booking date",
      "PP9/A,PP8,,Possession,50,Offer of Possession date",
    ].join("\n");
    expect(readImportFile(file, paymentPlansCsv([])).issues).toEqual([
      {
        row: 3,
        column: "Short Code",
        message: "Differs from row 2 of plan PP9/A. Repeat the same value, or leave it blank.",
      },
    ]);
  });
});

describe("export", () => {
  it("refuses an export too big to finish instead of cutting it off silently", async () => {
    const fetchPage = async (page: number) => ({ items: [page], pagination: { total_pages: 1001 } });
    await expect(fetchAllPages(fetchPage)).rejects.toBeInstanceOf(ExportTooLargeError);
  });

  it("writes timestamps in local time, in a form Excel reads as a date-time", () => {
    const local = new Date(2026, 10, 1, 16, 5);
    expect(stamp(local.toISOString())).toBe("2026-11-01 16:05");
    expect(stamp(null)).toBe("");
    expect(stamp("not a date")).toBe("not a date");
  });
});
