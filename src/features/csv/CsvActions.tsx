import { useEffect, useRef, useState } from "react";
import { ErrorBoundary } from "../../components/ErrorBoundary";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { ApiError, importRows, type ImportResult } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { csvBlob } from "../../lib/csv";
import { saveBlob } from "../../lib/download";
import { createIdempotencyKey } from "../../lib/idempotency";
import {
  ExportTooLargeError,
  MAX_IMPORT_BYTES,
  importErrorIssues,
  readImportFile,
  sampleCsv,
  sectionCsv,
  uniqueRows,
  type CsvSection,
  type ImportItem,
  type LoadRows,
  type RowIssue,
} from "./csvModel";

interface CsvActionsProps<T> {
  section: CsvSection<T>;
  loadRows: LoadRows<T>;
  /** Called after a successful import, to reload the page's list. */
  onImported?: () => void;
  /** Disables Export and Import, e.g. while the page's own data is still loading. */
  disabled?: boolean;
}

/** Export / Import / Sample CSV for one section. A crash here never takes the page down. */
export function CsvActions<T>(props: CsvActionsProps<T>) {
  return (
    <ErrorBoundary
      fallback={(reset) => (
        <Button variant="outline" size="sm" onClick={reset}>
          CSV tools failed · Retry
        </Button>
      )}
    >
      <CsvToolbar {...props} />
    </ErrorBoundary>
  );
}

const SEGMENT =
  "px-3 py-2 text-xs font-semibold text-text tabular-nums transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50";

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function exportErrorMessage(err: unknown) {
  if (err instanceof ExportTooLargeError) return err.message;
  if (!(err instanceof ApiError)) return "Export failed: could not reach the server. Check your connection and try again.";
  if (err.status >= 500) return "Export failed: the server hit an error. Please try again.";
  if (err.status === 403) return "Export failed: your account isn't allowed to view these records.";
  if (err.status === 422) return "Export failed: the server doesn't accept the current filters. Change them and try again.";
  return `Export failed: ${err.message}`;
}

function downloadSample<T>(section: CsvSection<T>) {
  saveBlob(csvBlob(sampleCsv(section)), `${section.file}-sample.csv`);
}

function CsvToolbar<T>({ section, loadRows, onImported, disabled }: CsvActionsProps<T>) {
  const [error, setError] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  function handleSample() {
    setError(null);
    try {
      downloadSample(section);
    } catch {
      setError("Could not create the sample file. Please try again.");
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div
        role="group"
        aria-label={`CSV for ${section.noun}`}
        className="inline-flex divide-x divide-border overflow-hidden rounded-xl border border-border bg-surface"
      >
        <button
          type="button"
          className={SEGMENT}
          disabled={disabled}
          onClick={() => {
            setError(null);
            setExportOpen(true);
          }}
        >
          Export CSV
        </button>
        {section.import && (
          <button
            type="button"
            className={SEGMENT}
            disabled={disabled}
            onClick={() => {
              setError(null);
              setImportOpen(true);
            }}
          >
            Import CSV
          </button>
        )}
        <button type="button" className={SEGMENT} onClick={handleSample}>
          Sample CSV
        </button>
      </div>
      {error && (
        <p role="alert" className="max-w-xs text-right text-xs text-danger">
          {error}
        </p>
      )}
      {exportOpen && <ExportDialog section={section} loadRows={loadRows} onClose={() => setExportOpen(false)} />}
      {importOpen && (
        <ImportDialog section={section} onClose={() => setImportOpen(false)} onImported={onImported} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Export: choose the fields, then save every matching record
// ---------------------------------------------------------------------------

const fieldsKey = (file: string) => `csv-export-fields:${file}`;

/** The fields this browser last exported for the section, if they still exist; else all. */
function rememberedFields<T>(section: CsvSection<T>): Set<string> {
  const all = section.columns.map((c) => c.header);
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(fieldsKey(section.file)) ?? "null");
    if (Array.isArray(saved)) {
      const kept = all.filter((h) => saved.includes(h));
      if (kept.length > 0) return new Set(kept);
    }
  } catch {
    // Storage blocked or unreadable: start with every field.
  }
  return new Set(all);
}

function rememberFields(file: string, chosen: Set<string>) {
  try {
    localStorage.setItem(fieldsKey(file), JSON.stringify([...chosen]));
  } catch {
    // Not remembering the choice is fine.
  }
}

/** Columns in groups, in the order the groups first appear. An ungrouped section is one list. */
function columnGroups<T>(section: CsvSection<T>) {
  const groups: { name: string; headers: string[] }[] = [];
  for (const column of section.columns) {
    const name = column.group ?? "";
    let group = groups.find((g) => g.name === name);
    if (!group) {
      group = { name, headers: [] };
      groups.push(group);
    }
    group.headers.push(column.header);
  }
  return groups;
}

function GroupCheckbox({
  label,
  checked,
  partial,
  onChange,
}: {
  label: string;
  checked: boolean;
  partial: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
      <input
        type="checkbox"
        className="h-4 w-4 accent-gold"
        checked={checked}
        ref={(el) => {
          if (el) el.indeterminate = partial;
        }}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

function ExportDialog<T>({
  section,
  loadRows,
  onClose,
}: {
  section: CsvSection<T>;
  loadRows: LoadRows<T>;
  onClose: () => void;
}) {
  const { accessToken } = useAuth();
  const [chosen, setChosen] = useState<Set<string>>(() => rememberedFields(section));
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const exportRun = useRef<AbortController | null>(null);

  // Closing the dialog or leaving the page stops an export: no more requests, no file saved.
  useEffect(() => () => exportRun.current?.abort(), []);

  const all = section.columns.map((c) => c.header);
  const groups = columnGroups(section);
  const grouped = groups.some((g) => g.name);
  const running = !!progress;

  function toggle(headers: string[], on: boolean) {
    setChosen((prev) => {
      const next = new Set(prev);
      for (const h of headers) {
        if (on) next.add(h);
        else next.delete(h);
      }
      return next;
    });
  }

  // An importable section's file can only be imported back with its import columns.
  const missingForImport = section.import
    ? section.columns.filter((c) => c.field && (c.required || c.unique) && !chosen.has(c.header)).map((c) => c.header)
    : [];

  async function handleExport() {
    if (!accessToken || exportRun.current || chosen.size === 0) return;
    const run = new AbortController();
    exportRun.current = run;
    setError(null);
    setProgress("Exporting…");
    try {
      const loaded = await loadRows(
        accessToken,
        (done, total) => {
          if (!run.signal.aborted && total > 1) setProgress(`Exporting ${Math.round((done / total) * 100)}%`);
        },
        run.signal
      );
      if (run.signal.aborted) return;
      const rows = uniqueRows(section, loaded);
      if (rows.length === 0) {
        setError(`There are no ${section.noun} to export. Check the search and filters.`);
        return;
      }
      saveBlob(csvBlob(sectionCsv(section, rows, chosen)), `${section.file}-${today()}.csv`);
      rememberFields(section.file, chosen);
      onClose();
    } catch (err) {
      if (!run.signal.aborted) setError(exportErrorMessage(err));
    } finally {
      exportRun.current = null;
      if (!run.signal.aborted) setProgress(null);
    }
  }

  function close() {
    exportRun.current?.abort();
    onClose();
  }

  const linkButton = "font-semibold text-gold underline disabled:opacity-50";

  return (
    <Modal
      open
      onClose={close}
      title={`Export ${section.noun}`}
      footer={
        <>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button onClick={() => void handleExport()} disabled={running || chosen.size === 0}>
            {progress ?? `Export ${chosen.size} field${chosen.size === 1 ? "" : "s"}`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p>
          Choose the fields to include in the file. Every record matching the current search and filters is exported.
        </p>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="font-semibold text-text">
            {chosen.size} of {all.length} fields
          </span>
          <button type="button" className={linkButton} disabled={running} onClick={() => toggle(all, true)}>
            Select all
          </button>
          <button type="button" className={linkButton} disabled={running} onClick={() => toggle(all, false)}>
            Clear all
          </button>
        </div>

        <fieldset disabled={running} className="max-h-[45dvh] space-y-4 overflow-y-auto pr-1">
          <legend className="sr-only">Fields to export</legend>
          {groups.map((group) => {
            const picked = group.headers.filter((h) => chosen.has(h)).length;
            return (
              <div
                key={group.name || "fields"}
                role={grouped ? "group" : undefined}
                aria-label={group.name || undefined}
                className="space-y-2"
              >
                {grouped && (
                  <GroupCheckbox
                    label={group.name}
                    checked={picked === group.headers.length}
                    partial={picked > 0 && picked < group.headers.length}
                    onChange={(on) => toggle(group.headers, on)}
                  />
                )}
                <div className={grouped ? "grid gap-2 pl-6 sm:grid-cols-2" : "grid gap-2 sm:grid-cols-2"}>
                  {group.headers.map((header) => (
                    <label key={header} className="flex items-center gap-2 text-sm text-text">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-gold"
                        checked={chosen.has(header)}
                        onChange={(e) => toggle([header], e.target.checked)}
                      />
                      {header}
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </fieldset>

        {chosen.size === 0 && <p className="text-xs text-warning">Choose at least one field.</p>}
        {missingForImport.length > 0 && chosen.size > 0 && (
          <p className="rounded-xl border border-warning/30 bg-warning-bg p-3 text-xs text-warning">
            To import this file back later, include {missingForImport.join(", ")}.
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-xl border border-danger/30 bg-danger-bg p-3 text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

function fileProblem(file: File): string | null {
  if (/\.(xlsx|xlsm|xls|ods|numbers)$/i.test(file.name))
    return 'This is a spreadsheet file, not CSV. In Excel choose File > Save As > "CSV UTF-8 (Comma delimited)", then choose that file.';
  const looksCsv = /\.(csv|txt)$/i.test(file.name) || (!/\.\w{1,5}$/.test(file.name) && /csv|text\/plain/.test(file.type));
  if (!looksCsv) return "Choose a .csv file.";
  if (file.size === 0) return "The file is empty.";
  if (file.size > MAX_IMPORT_BYTES) return "The file is larger than 5 MB. Split it into smaller files.";
  return null;
}

/** The file's text, whichever encoding Excel used to save it. */
async function readText(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  // Excel's "Unicode Text" is UTF-16 with a byte-order mark.
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    // Not valid UTF-8: Excel's plain "CSV (Comma delimited)" is saved as Windows-1252.
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/**
 * What each section last imported successfully in this browser tab. Choosing the same file
 * again gets a fresh key, so it would add its new rows a second time: the dialog warns first.
 */
const lastImported = new Map<string, { content: string; at: Date }>();

/** Network failures and server errors may succeed on a retry of the same request. */
function canRetry(err: unknown) {
  return !(err instanceof ApiError) || err.status >= 500 || err.status === 429;
}

const MAX_SHOWN_ISSUES = 50;

function IssueList({ issues }: { issues: RowIssue[] }) {
  const located = issues.some((i) => i.row !== null || i.column);
  return (
    <div role="alert" className="rounded-xl border border-danger/30 bg-danger-bg p-3 text-sm text-danger">
      {located && (
        <p className="mb-2 font-semibold">
          {issues.length} problem{issues.length === 1 ? "" : "s"} found. Nothing was imported: fix the file and choose
          it again.
        </p>
      )}
      <ul className="max-h-52 space-y-1 overflow-y-auto text-xs">
        {issues.slice(0, MAX_SHOWN_ISSUES).map((issue, i) => (
          <li key={i}>
            {issue.row !== null && <span className="font-semibold">Row {issue.row}</span>}
            {issue.column && <span className="font-semibold">{issue.row !== null ? " · " : ""}{issue.column}</span>}
            {(issue.row !== null || issue.column) && ": "}
            {issue.message}
          </li>
        ))}
      </ul>
      {issues.length > MAX_SHOWN_ISSUES && (
        <p className="mt-1 text-xs">…and {issues.length - MAX_SHOWN_ISSUES} more.</p>
      )}
    </div>
  );
}

function ImportDialog<T>({
  section,
  onClose,
  onImported,
}: {
  section: CsvSection<T>;
  onClose: () => void;
  onImported?: () => void;
}) {
  const { accessToken } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  const [fileName, setFileName] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  // The key stays with the parsed file, so a retry after a lost response never imports it twice.
  const [prepared, setPrepared] = useState<{ items: ImportItem[]; key: string; content: string } | null>(null);
  const [issues, setIssues] = useState<RowIssue[]>([]);
  const [ignored, setIgnored] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const required = section.columns.filter((c) => c.field && c.required).map((c) => c.header);
  const busy = reading || saving;

  async function chooseFile(file: File | undefined) {
    if (!file || busy) return;
    setFileName(file.name);
    setPrepared(null);
    setIssues([]);
    setIgnored([]);
    setResult(null);
    const problem = fileProblem(file);
    if (problem) {
      setIssues([{ row: null, message: problem }]);
      return;
    }
    setReading(true);
    try {
      const read = readImportFile(await readText(file), section);
      if (!mounted.current) return;
      setIgnored(read.ignored);
      if (read.issues.length > 0) setIssues(read.issues);
      else setPrepared({ items: read.items, key: createIdempotencyKey(), content: JSON.stringify(read.items) });
    } catch {
      if (mounted.current) setIssues([{ row: null, message: "The file could not be read. Save it again as CSV and retry." }]);
    } finally {
      if (mounted.current) setReading(false);
    }
  }

  async function submit() {
    if (!accessToken || !prepared || !section.import || saving) return;
    setSaving(true);
    setIssues([]);
    try {
      const res = await importRows(accessToken, section.import.entity, prepared.items, prepared.key);
      lastImported.set(section.import.entity, { content: prepared.content, at: new Date() });
      if (!mounted.current) return;
      setResult({ created: res?.created ?? 0, updated: res?.updated ?? 0 });
      setPrepared(null);
      onImported?.();
    } catch (err) {
      if (!mounted.current) return;
      setIssues(importErrorIssues(err, prepared.items, section));
      if (!canRetry(err)) setPrepared(null);
    } finally {
      if (mounted.current) setSaving(false);
    }
  }

  const previous = prepared && section.import ? lastImported.get(section.import.entity) : undefined;
  const alreadyImported = !!previous && previous.content === prepared?.content;
  const count = prepared?.items.length ?? 0;
  const counted = `${count} ${count === 1 ? section.noun.replace(/s$/, "") : section.noun}`;

  return (
    <Modal
      open
      onClose={() => !saving && onClose()}
      title={`Import ${section.noun}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {result ? "Close" : "Cancel"}
          </Button>
          {!result && (
            <Button onClick={submit} disabled={!prepared || busy}>
              {saving ? "Importing…" : count ? `Import ${counted}` : "Import"}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-3">
        <p>{section.import?.help}</p>
        <p className="text-xs">
          Required columns: <span className="font-semibold text-text">{required.join(", ")}</span>. Columns the import
          doesn't use (like Created At) are ignored, so an exported file can be imported again. Nothing is saved
          unless every row is valid.{" "}
          <button type="button" className="font-semibold text-gold underline" onClick={() => downloadSample(section)}>
            Download the sample file
          </button>
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.txt,text/csv,text/plain,application/vnd.ms-excel"
            className="sr-only"
            aria-label="CSV file"
            onChange={(e) => {
              const file = e.target.files?.[0];
              // Cleared so choosing the same file again (after fixing it) still triggers a change.
              e.target.value = "";
              void chooseFile(file);
            }}
          />
          <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={busy}>
            {fileName ? "Choose another file" : "Choose CSV file"}
          </Button>
          {fileName && <span className="min-w-0 max-w-full flex-1 truncate text-xs text-text" title={fileName}>{fileName}</span>}
        </div>

        {reading && <p className="text-xs">Checking the file…</p>}
        {issues.length > 0 && <IssueList issues={issues} />}
        {prepared && !saving && issues.length === 0 && (
          <p className="rounded-xl border border-success/30 bg-success-bg p-3 text-sm text-success">
            {counted} checked and ready to import.
          </p>
        )}
        {alreadyImported && !saving && (
          <p className="rounded-xl border border-warning/30 bg-warning-bg p-3 text-sm text-warning">
            You already imported this exact file at{" "}
            {previous.at.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}. Importing it again adds
            its new rows a second time. Only continue if that is what you want.
          </p>
        )}
        {ignored.length > 0 && !result && (
          <p className="text-xs text-warning">Ignored unknown column{ignored.length === 1 ? "" : "s"}: {ignored.join(", ")}.</p>
        )}
        {result && (
          <p role="status" className="rounded-xl border border-success/30 bg-success-bg p-3 text-sm text-success">
            Import complete: {result.created} added, {result.updated} updated.
          </p>
        )}
      </div>
    </Modal>
  );
}
