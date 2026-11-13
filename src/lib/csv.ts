/**
 * RFC 4180 CSV writing and reading. Files are written the way Excel and Google Sheets
 * open them cleanly: UTF-8 with a byte-order mark, CRLF line ends, quotes only where needed.
 */
export type CsvCell = string | number | boolean | null | undefined;

const NEEDS_QUOTES = /[",\r\n]/;
// A cell starting with one of these runs as a formula in Excel / Sheets (CSV injection).
const FORMULA_START = /^[=+\-@\t\r]/;
// ...except plain numbers such as "+91 98765 43210" or "-500", which are safe and common.
const PLAIN_NUMBER = /^[+-]?[\d\s().,]+$/;

function writeCell(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (FORMULA_START.test(text) && !PLAIN_NUMBER.test(text)) text = `'${text}`;
  return NEEDS_QUOTES.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header: string[], rows: CsvCell[][]): string {
  return [header, ...rows].map((row) => row.map(writeCell).join(",")).join("\r\n") + "\r\n";
}

/** Undoes the formula guard added on export, so an exported file imports unchanged. */
export function unguardCell(value: string): string {
  return value.startsWith("'") && FORMULA_START.test(value.slice(1)) ? value.slice(1) : value;
}

export function csvBlob(text: string): Blob {
  return new Blob(["﻿", text], { type: "text/csv;charset=utf-8" });
}

export class CsvParseError extends Error {}

/**
 * The separator the first line uses most, ignoring quoted text: "," normally, ";" from
 * Excel in some locales, tab from Excel's "Unicode Text" or a copy-paste.
 */
function detectDelimiter(firstLine: string): string {
  const bare = firstLine.replace(/"[^"]*"/g, "");
  let best = ",";
  let bestCount = 0;
  for (const candidate of [",", ";", "\t"]) {
    const count = bare.split(candidate).length - 1;
    if (count > bestCount) [best, bestCount] = [candidate, count];
  }
  return best;
}

/**
 * Every record in the file, blank ones included, so record N is spreadsheet row N.
 * Strips a byte-order mark, accepts CRLF / LF / CR, detects the separator, and allows
 * spaces before an opening quote (`a, "b,c"`).
 */
export function parseCsv(text: string): string[][] {
  const start = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  const lineEnd = text.slice(start).search(/[\r\n]/);
  const delimiter = detectDelimiter(text.slice(start, lineEnd < 0 ? undefined : start + lineEnd));

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch !== '"') field += ch;
      else if (text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = false;
    } else if (ch === '"' && field.trim() === "") {
      quoted = true;
      field = "";
    }
    else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (quoted) throw new CsvParseError("The file has a quote (\") that is never closed, so it can't be read.");
  row.push(field);
  if (row.length > 1 || field !== "") rows.push(row);
  return rows;
}
