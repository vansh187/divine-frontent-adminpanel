import { describe, expect, it } from "vitest";
import { CsvParseError, parseCsv, toCsv, unguardCell } from "./csv";

describe("toCsv", () => {
  it("quotes only cells that need it and ends lines with CRLF", () => {
    expect(toCsv(["Name", "Note"], [["Arjun", 'Said "hi", left'], ["Neha", "line1\nline2"], [null, undefined]])).toBe(
      'Name,Note\r\nArjun,"Said ""hi"", left"\r\nNeha,"line1\nline2"\r\n,\r\n'
    );
  });

  it("guards formulas but leaves phone numbers and negative amounts alone", () => {
    expect(toCsv(["v"], [["=HYPERLINK(\"x\")"], ["@SUM(A1)"], ["-2+cmd|x"], ["+91 98765 43210"], [-500]])).toBe(
      'v\r\n"\'=HYPERLINK(""x"")"\r\n\'@SUM(A1)\r\n\'-2+cmd|x\r\n+91 98765 43210\r\n-500\r\n'
    );
  });
});

describe("parseCsv", () => {
  it("reads what toCsv writes, including quotes, commas and newlines", () => {
    const rows = [["a,b", 'say "x"', "multi\r\nline", ""]];
    const parsed = parseCsv(toCsv(["h1", "h2", "h3", "h4"], rows));
    expect(parsed).toEqual([["h1", "h2", "h3", "h4"], ...rows]);
  });

  it("strips a BOM, accepts LF and CR line ends, and keeps blank rows so row numbers match", () => {
    expect(parseCsv("﻿a,b\n1,2\r\r3,4")).toEqual([["a", "b"], ["1", "2"], [""], ["3", "4"]]);
  });

  it("reads semicolon-separated files", () => {
    expect(parseCsv("Name;Email\r\nArjun;a@x.com\r\n")).toEqual([["Name", "Email"], ["Arjun", "a@x.com"]]);
  });

  it("refuses an unclosed quote", () => {
    expect(() => parseCsv('a\n"open')).toThrow(CsvParseError);
  });
});

describe("unguardCell", () => {
  it("undoes the export formula guard only", () => {
    expect(unguardCell("'=SUM(A1)")).toBe("=SUM(A1)");
    expect(unguardCell("'quoted")).toBe("'quoted");
  });
});
