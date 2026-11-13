/**
 * One column list per section drives its export, its sample file and its import, so the
 * three always use the same headers. Kept free of React so the rules are unit-tested.
 */
import { ApiError, type ImportEntity } from "../../lib/api";
import { parseCsv, toCsv, unguardCell, type CsvCell } from "../../lib/csv";

export type ParseResult = { value: unknown } | { error: string };

export interface CsvColumn<T> {
  header: string;
  /** Heading the column is listed under when choosing which fields to export. */
  group?: string;
  /** Extra detail, left unticked until the admin chooses it (and left out of the sample). */
  optional?: boolean;
  /** The column's name in a file the server builds (see CsvActions' `downloadFile`). */
  key?: string;
  value: (row: T) => CsvCell;
  /** Request field the import sends this column as. Columns without one are export-only. */
  field?: string;
  /** Required when adding a record (a row without an ID). */
  required?: boolean;
  /** No two rows of one import may share a value (case-insensitive). */
  unique?: boolean;
  /** Turns a non-blank cell into the value sent, or says what is wrong. Default: text up to 200 characters. */
  parse?: (raw: string) => ParseResult;
}

export interface ImportRecord {
  /** Spreadsheet row number (the header is row 1). */
  row: number;
  /** Trimmed cells by column header. Blank or missing cells are "". */
  cells: Record<string, string>;
}

export interface RowIssue {
  row: number | null;
  column?: string;
  message: string;
}

export type ImportItem = { row: number } & Record<string, unknown>;

export interface BuiltImport {
  items: ImportItem[];
  issues: RowIssue[];
}

export interface CsvSection<T> {
  /** File name stem: customers-2026-11-13.csv, customers-sample.csv. */
  file: string;
  /** Plural noun used in messages. */
  noun: string;
  columns: CsvColumn<T>[];
  /** Identifies a record, so a row that shifts between pages during an export isn't written twice. */
  key: (row: T) => string;
  /** Example records for the sample file, written exactly like an export. */
  sample: T[];
  import?: {
    entity: ImportEntity;
    /** What an import does, shown in the import dialog. */
    help: string;
    /** Custom grouping, e.g. several rows per payment plan. Default: one item per row. */
    build?: (records: ImportRecord[]) => BuiltImport;
  };
}

export const MAX_IMPORT_ROWS = 5000;
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Cell parsers. Lenient about the formats Excel produces when it re-saves a file.
// ---------------------------------------------------------------------------

// One address: no spaces, separators or brackets, no "..", and a 2+ letter domain ending.
const EMAIL_RE = /^(?!.*\.\.)[^\s@,;:<>()[\]"]+@[^\s@,;:<>()[\]"]+\.[A-Za-z]{2,}$/;

export function text(max = 200, min = 1) {
  return (raw: string): ParseResult =>
    raw.length > max ? { error: `Max ${max} characters.` } : raw.length < min ? { error: `At least ${min} characters.` } : { value: raw };
}

export function email(raw: string): ParseResult {
  return EMAIL_RE.test(raw) && raw.length <= 254 ? { value: raw } : { error: "Not a valid email address." };
}

export function phone(raw: string): ParseResult {
  if (/^\d+(\.\d+)?e\+?\d+$/i.test(raw))
    return { error: `Excel changed this number to "${raw}". Format the column as Text, type the number again and save.` };
  // "9876543210.0": a whole number some tools write as a decimal.
  const value = /^\+?\d+\.0+$/.test(raw) ? raw.replace(/\.0+$/, "") : raw;
  if (value.length > 20) return { error: "Max 20 characters." };
  return /\d/.test(value) ? { value } : { error: "Not a valid phone number." };
}

const squash = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

/** One of `options` (API value -> label). Accepts the value or the label, any case or spacing. */
export function oneOf(options: Record<string, string>) {
  const lookup = new Map<string, string>();
  for (const [value, label] of Object.entries(options)) {
    lookup.set(squash(value), value);
    lookup.set(squash(label), value);
  }
  return (raw: string): ParseResult => {
    const value = lookup.get(squash(raw));
    return value !== undefined ? { value } : { error: `Use one of: ${Object.values(options).join(", ")}.` };
  };
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** [day, month, year] from the formats Excel writes in India, or null. */
function dateParts(raw: string): [number, number, number] | null {
  let match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(raw);
  if (match) return [Number(match[3]), Number(match[2]), Number(match[1])];
  // Day first, as everywhere in India: 20-11-2026, 20/11/26, 20.11.2026.
  match = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(raw);
  if (match) return [Number(match[1]), Number(match[2]), Number(match[3])];
  // Month names: 20-Nov-2026, 20 November 26, Nov 20, 2026.
  match = /^(\d{1,2})[-\s/.]+([a-z]{3,9})\.?[-\s/.,]+(\d{2}|\d{4})$/i.exec(raw);
  const named = match ? null : /^([a-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/i.exec(raw);
  const [day, name, year] = match ? [match[1], match[2], match[3]] : named ? [named[2], named[1], named[3]] : [];
  const month = name ? MONTHS.indexOf(name.slice(0, 3).toLowerCase()) + 1 : 0;
  return month ? [Number(day), month, Number(year)] : null;
}

/** A calendar date in any format Excel writes in India. Sent as YYYY-MM-DD. */
export function date(raw: string): ParseResult {
  const parts = dateParts(raw);
  if (parts) {
    const [d, m, y] = parts;
    const year = y < 100 ? 2000 + y : y;
    const value = new Date(Date.UTC(year, m - 1, d));
    if (value.getUTCFullYear() === year && value.getUTCMonth() === m - 1 && value.getUTCDate() === d)
      return { value: value.toISOString().slice(0, 10) };
  }
  return { error: "Not a valid date. Use YYYY-MM-DD (2026-11-20) or DD-MM-YYYY (20-11-2026)." };
}

/** 24-hour HH:MM (seconds ignored) or 12-hour "4:30 PM". Sent as HH:MM. */
export function time(raw: string): ParseResult {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap]\.?m\.?)?$/i.exec(raw);
  if (match) {
    let hours = Number(match[1]);
    const minutes = Number(match[2]);
    const meridiem = match[3]?.[0].toLowerCase();
    if (meridiem && (hours < 1 || hours > 12)) hours = -1;
    else if (meridiem) hours = (hours % 12) + (meridiem === "p" ? 12 : 0);
    if (hours >= 0 && hours < 24 && minutes < 60)
      return { value: `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}` };
  }
  return { error: "Not a valid time. Use 24-hour HH:MM, e.g. 16:30." };
}

// ---------------------------------------------------------------------------
// Export and sample
// ---------------------------------------------------------------------------

/**
 * The file for `rows`. `headers` limits it to the fields the admin chose; columns keep the
 * section's order whatever order they were picked in.
 */
export function sectionCsv<T>(section: CsvSection<T>, rows: T[], headers?: Iterable<string>): string {
  const chosen = headers ? new Set(headers) : null;
  const columns = chosen ? section.columns.filter((c) => chosen.has(c.header)) : section.columns;
  return toCsv(
    columns.map((c) => c.header),
    rows.map((row) => columns.map((c) => c.value(row)))
  );
}

/** Importable sections: just the columns an import reads. Others: the export layout. */
export function sampleCsv<T>(section: CsvSection<T>): string {
  const columns = section.import ? section.columns.filter((c) => c.field) : section.columns.filter((c) => !c.optional);
  return sectionCsv({ ...section, columns }, section.sample);
}

export function uniqueRows<T>(section: CsvSection<T>, rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = section.key(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export const EXPORT_PAGE_SIZE = 100; // the backend's maximum page_size
const EXPORT_CONCURRENCY = 4;
const MAX_EXPORT_PAGES = 1000;

/** An export too big to do in one go; the message tells the admin what to do. */
export class ExportTooLargeError extends Error {}

interface Page<T> {
  items: T[];
  pagination?: { total_pages: number };
}

/** Network failures, 5xx and 429 are worth one more try; other errors are final. */
function isTransient(err: unknown) {
  return !(err instanceof ApiError) || err.status >= 500 || err.status === 429;
}

async function withRetry<T>(load: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    signal?.throwIfAborted();
    try {
      return await load();
    } catch (err) {
      if (attempt >= 2 || !isTransient(err)) throw err;
      await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
    }
  }
}

/** Every page of a list endpoint, a few at a time, in order. */
export async function fetchAllPages<T>(
  fetchPage: (page: number, pageSize: number) => Promise<Page<T>>,
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal
): Promise<T[]> {
  const first = await withRetry(() => fetchPage(1, EXPORT_PAGE_SIZE), signal);
  const total = Math.max(1, first.pagination?.total_pages ?? 1);
  if (total > MAX_EXPORT_PAGES)
    throw new ExportTooLargeError(
      `More than ${(MAX_EXPORT_PAGES * EXPORT_PAGE_SIZE).toLocaleString("en-IN")} records match. Narrow the filters and export in parts.`
    );
  const pages: T[][] = [first.items ?? []];
  let next = 2;
  let done = 1;
  let failed = false;
  onProgress?.(done, total);

  async function worker() {
    while (!failed && next <= total) {
      const page = next++;
      try {
        pages[page - 1] = (await withRetry(() => fetchPage(page, EXPORT_PAGE_SIZE), signal)).items ?? [];
      } catch (err) {
        failed = true;
        throw err;
      }
      onProgress?.(++done, total);
    }
  }
  await Promise.all(Array.from({ length: Math.min(EXPORT_CONCURRENCY, total - 1) }, worker));
  signal?.throwIfAborted();
  return pages.flat();
}

/** Loads every record to export, with the page's current filters. */
export type LoadRows<T> = (
  token: string,
  onProgress: (done: number, total: number) => void,
  signal: AbortSignal
) => Promise<T[]>;

/** LoadRows for a paginated list endpoint. */
export function pagedRows<T>(fetchPage: (token: string, page: number, pageSize: number) => Promise<Page<T>>): LoadRows<T> {
  return (token, onProgress, signal) => fetchAllPages((page, size) => fetchPage(token, page, size), onProgress, signal);
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/** One item per row, from the columns that have a `field`. */
export function buildRows<T>(columns: CsvColumn<T>[], records: ImportRecord[]): BuiltImport {
  const fields = columns.filter((c) => c.field);
  const idColumn = fields.find((c) => c.field === "id");
  const seen = new Map<string, Map<string, number>>();
  const copies = new Map<string, number>();
  const items: ImportItem[] = [];
  const issues: RowIssue[] = [];

  for (const record of records) {
    // A row pasted twice would add the same record twice (site visits have no unique column).
    const signature = fields.map((c) => (record.cells[c.header] ?? "").toLowerCase()).join("\u0001");
    const original = copies.get(signature);
    if (original !== undefined) {
      issues.push({ row: record.row, message: `This row is an exact copy of row ${original}. Delete one of them.` });
      continue;
    }
    copies.set(signature, record.row);
    const adding = !idColumn || !record.cells[idColumn.header];
    const item: ImportItem = { row: record.row };
    let valid = true;
    for (const column of fields) {
      const raw = record.cells[column.header] ?? "";
      const fail = (message: string) => {
        issues.push({ row: record.row, column: column.header, message });
        valid = false;
      };
      if (!raw) {
        if (column.required && adding) fail(`${column.header} is required.`);
        continue;
      }
      const result = (column.parse ?? text())(raw);
      if ("error" in result) {
        fail(result.error);
        continue;
      }
      if (column.unique) {
        const values = seen.get(column.header) ?? new Map<string, number>();
        seen.set(column.header, values);
        const key = String(result.value).toLowerCase();
        const earlier = values.get(key);
        if (earlier !== undefined) {
          fail(`Same ${column.header} as row ${earlier}.`);
          continue;
        }
        values.set(key, record.row);
      }
      item[column.field as string] = result.value;
    }
    if (valid) items.push(item);
  }
  return { items, issues };
}

const HEADER_SEARCH_ROWS = 10;

/** Trimmed, without the invisible characters copy-paste brings along (zero-width spaces, BOMs). */
function cleanCell(cell: string) {
  return cell.replace(/[​-‍⁠﻿­]/g, "").trim();
}

export interface ReadImport extends BuiltImport {
  /** Headers the import doesn't know, so a typo in a header isn't silently ignored. */
  ignored: string[];
}

export function readImportFile<T>(content: string, section: CsvSection<T>): ReadImport {
  const fail = (message: string): ReadImport => ({ items: [], issues: [{ row: null, message }], ignored: [] });
  let rows: string[][];
  try {
    rows = parseCsv(content);
  } catch (err) {
    return fail(err instanceof Error ? err.message : "The file could not be read.");
  }

  rows = rows.map((row) => row.map(cleanCell));
  const isBlank = (row: string[]) => row.every((cell) => !cell);
  const firstFilled = rows.findIndex((row) => !isBlank(row));
  if (firstFilled < 0) return fail("The file is empty.");

  const byName = new Map<string, CsvColumn<T>>();
  for (const column of section.columns) {
    byName.set(squash(column.header), column);
    if (column.field) byName.set(squash(column.field), column);
  }
  // The header is the first row naming a known column, so a title row above it is fine.
  const knownAt = rows
    .slice(firstFilled, firstFilled + HEADER_SEARCH_ROWS)
    .findIndex((row) => row.some((cell) => cell && byName.has(squash(cell))));
  const headerIndex = knownAt < 0 ? firstFilled : firstFilled + knownAt;
  const positions: { index: number; column: CsvColumn<T> }[] = [];
  const ignored: string[] = [];
  const issues: RowIssue[] = [];
  rows[headerIndex].forEach((rawHeader, index) => {
    const header = rawHeader.trim();
    const column = header ? byName.get(squash(header)) : undefined;
    if (!column) {
      if (header) ignored.push(header);
    } else if (positions.some((p) => p.column === column)) {
      issues.push({ row: headerIndex + 1, message: `The column "${column.header}" appears more than once.` });
    } else if (column.field) {
      positions.push({ index, column });
    }
  });

  const missing = section.columns.filter((c) => c.field && c.required && !positions.some((p) => p.column === c));
  if (missing.length > 0)
    issues.push({
      row: headerIndex + 1,
      message: `Missing column${missing.length === 1 ? "" : "s"}: ${missing.map((c) => c.header).join(", ")}. Download the sample file to see the expected columns.`,
    });
  if (issues.length > 0) return { items: [], issues, ignored };

  const records: ImportRecord[] = [];
  for (let i = headerIndex + 1; i < rows.length; i++) {
    if (isBlank(rows[i])) continue;
    // Every importable column has a cell, "" when the file leaves the column out.
    const cells: Record<string, string> = Object.fromEntries(
      section.columns.filter((c) => c.field).map((c) => [c.header, ""])
    );
    for (const { index, column } of positions) cells[column.header] = unguardCell(rows[i][index] ?? "");
    records.push({ row: i + 1, cells });
  }
  if (records.length === 0) return { ...fail("There are no rows under the header row."), ignored };
  if (records.length > MAX_IMPORT_ROWS)
    return { ...fail(`The file has ${records.length} rows. Import at most ${MAX_IMPORT_ROWS} at a time.`), ignored };

  // The sample's example rows, left in by mistake, would be imported as real records.
  const fieldColumns = section.columns.filter((c) => c.field);
  const signature = (cell: (c: CsvColumn<T>) => string) => fieldColumns.map(cell).join("\u0001");
  const examples = new Set(section.sample.map((s) => signature((c) => cleanCell(String(c.value(s) ?? "")))));
  const exampleIssues: RowIssue[] = records
    .filter((r) => examples.has(signature((c) => r.cells[c.header])))
    .map((r) => ({ row: r.row, message: "This is the example row from the sample file. Delete it, then import." }));

  const built = section.import?.build ? section.import.build(records) : buildRows(section.columns, records);
  return { items: built.items, issues: [...exampleIssues, ...built.issues], ignored };
}

const NOT_LIVE =
  "Importing needs a server update that isn't live yet (docs/csv-import-backend.md). Nothing was imported. Contact the tech team.";

/** Problems from a failed import request, by spreadsheet row where the server says which. */
export function importErrorIssues<T>(err: unknown, items: ImportItem[], section: CsvSection<T>): RowIssue[] {
  const one = (message: string): RowIssue[] => [{ row: null, message }];
  if (!(err instanceof ApiError))
    return one("Could not reach the server. Check your connection and try again; the same file is never imported twice.");

  const headerFor = (field: unknown) => section.columns.find((c) => c.field === field)?.header;
  const detail = err.detail as { errors?: { row?: number; field?: string; message?: string }[] } | undefined;
  if (Array.isArray(detail?.errors) && detail.errors.length > 0) {
    return detail.errors.map((e) => ({
      row: typeof e.row === "number" ? e.row : null,
      column: headerFor(e.field),
      message: e.message || "This row was refused.",
    }));
  }
  if (err.validationErrors?.length) {
    // FastAPI's own 422: loc is ["body", "rows", <index>, <field>, ...].
    return err.validationErrors.map((e) => {
      const at = e.loc.indexOf("rows");
      const index = at >= 0 ? e.loc[at + 1] : undefined;
      return {
        row: typeof index === "number" ? (items[index]?.row ?? null) : null,
        column: at >= 0 ? headerFor(e.loc[at + 2]) : undefined,
        message: e.msg,
      };
    });
  }
  if (err.status === 404 || err.status === 405) return one(NOT_LIVE);
  if (err.status === 403) return one(`Your account isn't allowed to import ${section.noun}. Ask a super admin.`);
  if (err.status === 409 && err.code === "idempotency_conflict")
    return one("This import was already sent with different content. Choose the file again and import it.");
  if (err.status === 413) return one(`The file is too large. Import at most ${MAX_IMPORT_ROWS} rows at a time.`);
  if (err.status === 429) return one("Too many imports in a short time. Wait a minute and try again.");
  if (err.status >= 500) return one("The server hit an error and nothing was imported. Please try again.");
  return one(err.message);
}
