import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, type ApiCustomer } from "../../lib/api";
import { CsvActions } from "./CsvActions";
import { ExportTooLargeError, type CsvSection } from "./csvModel";
import { bookingsCsv, customersCsv, inventoryCsv } from "./sections";

const importRows = vi.fn();
vi.mock("../../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/api")>()),
  importRows: (...args: unknown[]) => importRows(...args),
}));
vi.mock("../../lib/auth", () => ({ useAuth: () => ({ accessToken: "token" }) }));
const saveBlob = vi.fn();
vi.mock("../../lib/download", () => ({ saveBlob: (...args: unknown[]) => saveBlob(...args) }));

const customer: ApiCustomer = {
  id: "c1",
  full_name: "Arjun Mehta",
  email: "arjun@example.com",
  phone: "+91 98765 43210",
  source: "WEBSITE",
  status: "LEAD",
  created_at: "2026-11-01T10:00:00Z",
  last_activity_at: "2026-11-02T10:00:00Z",
};

const csvFile = (content: string, name = "customers.csv") => new File([content], name, { type: "text/csv" });

async function savedText(call = 0) {
  return (saveBlob.mock.calls[call][0] as Blob).text();
}

beforeEach(() => {
  importRows.mockReset();
  saveBlob.mockReset();
  localStorage.clear();
});

/** Opens the export dialog and exports with the fields currently ticked. */
async function exportFile() {
  await userEvent.click(screen.getByRole("button", { name: "Export CSV" }));
  await userEvent.click(screen.getByRole("button", { name: /^Export \d+ fields?$/ }));
}

describe("CsvActions export and sample", () => {
  it("exports every loaded row once, as a dated UTF-8 file", async () => {
    const loadRows = vi.fn(async () => [customer, customer, { ...customer, id: "c2", email: "neha@example.com" }]);
    render(<CsvActions section={customersCsv} loadRows={loadRows} />);
    await exportFile();

    await waitFor(() => expect(saveBlob).toHaveBeenCalledTimes(1));
    expect(loadRows).toHaveBeenCalledWith("token", expect.any(Function), expect.any(AbortSignal));
    expect(saveBlob.mock.calls[0][1]).toMatch(/^customers-\d{4}-\d{2}-\d{2}\.csv$/);
    const content = await savedText();
    expect(content.split("\r\n").filter(Boolean)).toHaveLength(3);
    expect(content.split("\r\n")[0]).toBe("ID,Full Name,Email,Phone,Source,Status,Created At,Last Activity");
    // Byte-order mark, so Excel reads the file as UTF-8 (Blob.text() hides it).
    const bytes = new Uint8Array(await (saveBlob.mock.calls[0][0] as Blob).arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    // The dialog closes once the file is saved.
    expect(screen.queryByRole("heading", { name: "Export customers" })).not.toBeInTheDocument();
  });

  it("writes a customer's source with the same words as the Customers page", async () => {
    render(<CsvActions section={customersCsv} loadRows={async (): Promise<ApiCustomer[]> => [{ ...customer, source: "OFFLINE_IMPORT" }]} />);
    await exportFile();
    await waitFor(() => expect(saveBlob).toHaveBeenCalledTimes(1));
    expect((await savedText()).split("\r\n")[1]).toContain(",Offline buyer,");
  });

  it("exports only the fields chosen, in the section's column order", async () => {
    render(<CsvActions section={customersCsv} loadRows={async () => [customer]} />);
    await userEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    await userEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(screen.getByRole("button", { name: "Export 0 fields" })).toBeDisabled();
    expect(screen.getByText("Choose at least one field.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: "Phone" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Full Name" }));
    await userEvent.click(screen.getByRole("button", { name: "Export 2 fields" }));

    await waitFor(() => expect(saveBlob).toHaveBeenCalledTimes(1));
    expect((await savedText()).split("\r\n")).toEqual(["Full Name,Phone", "Arjun Mehta,+91 98765 43210", ""]);
  });

  it("remembers the chosen fields for the next export of that section", async () => {
    const { unmount } = render(<CsvActions section={customersCsv} loadRows={async () => [customer]} />);
    await userEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Created At" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Last Activity" }));
    await userEvent.click(screen.getByRole("button", { name: "Export 6 fields" }));
    await waitFor(() => expect(saveBlob).toHaveBeenCalledTimes(1));
    unmount();

    render(<CsvActions section={customersCsv} loadRows={async () => [customer]} />);
    await userEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    expect(screen.getByRole("checkbox", { name: "Created At" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Email" })).toBeChecked();
    expect(screen.getByText("6 of 8 fields")).toBeInTheDocument();
    // Each section keeps its own choice.
    expect(localStorage.getItem("csv-export-fields:bookings")).toBeNull();
  });

  it("warns that a file without its import columns can't be imported back", async () => {
    render(<CsvActions section={customersCsv} loadRows={async () => [customer]} />);
    await userEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    expect(screen.queryByText(/To import this file back later/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: "ID" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Email" }));
    expect(screen.getByText("To import this file back later, include ID, Email.")).toBeInTheDocument();
  });

  it("lists grouped fields under their headings and ticks a whole group at once", async () => {
    const downloadFile = vi.fn(async () => ({ blob: new Blob(["Plot No\r\nC-12\r\n"]), filename: "inventory-2026-11-13.csv" }));
    render(<CsvActions section={inventoryCsv} downloadFile={downloadFile} />);
    await userEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    const client = screen.getByRole("group", { name: "Client" });
    expect(within(client).getAllByRole("checkbox").map((c) => c.closest("label")?.textContent)).toEqual([
      "Client",
      "Client Name",
      "Phone",
      "Alternative Number",
      "Email ID",
      "Address",
    ]);
    await userEvent.click(screen.getByRole("button", { name: "Clear all" }));
    await userEvent.click(within(client).getByRole("checkbox", { name: "Client" }));
    const plot = screen.getByRole("group", { name: "Plot" });
    await userEvent.click(within(plot).getByRole("checkbox", { name: "Plot No" }));
    expect(within(plot).getByRole<HTMLInputElement>("checkbox", { name: "Plot" }).indeterminate).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Export 6 fields" }));

    await waitFor(() => expect(saveBlob).toHaveBeenCalledTimes(1));
    // The server's column keys, in the client's column order, not the order they were ticked in.
    expect(downloadFile).toHaveBeenCalledWith(
      "token",
      ["unit_number", "client_name", "phone", "alternative_number", "email", "address"],
      expect.any(AbortSignal)
    );
  });

  it("starts with the client's sheet columns and leaves the extra details unticked", async () => {
    render(<CsvActions section={inventoryCsv} downloadFile={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    expect(screen.getByText("20 of 28 fields")).toBeInTheDocument();
    const more = screen.getByRole("group", { name: "More Details" });
    expect(within(more).getByRole("checkbox", { name: "Plot ID" })).not.toBeChecked();
    expect(within(more).getByRole<HTMLInputElement>("checkbox", { name: "More Details" }).checked).toBe(false);
    expect(screen.getByRole("checkbox", { name: "Plot Address" })).toBeChecked();
  });

  it("saves the server's file exactly as it comes, under the server's file name", async () => {
    // The server already guards cells against formulas; the panel must not add a second apostrophe.
    const content = "﻿Plot No,Phone\r\nC-12,'+919876543210\r\n";
    const blob = new Blob([content], { type: "text/csv" });
    render(<CsvActions section={inventoryCsv} downloadFile={async () => ({ blob, filename: "inventory-2026-11-13.csv" })} />);
    await exportFile();
    await waitFor(() => expect(saveBlob).toHaveBeenCalledTimes(1));
    expect(saveBlob.mock.calls[0][0]).toBe(blob);
    expect(saveBlob.mock.calls[0][1]).toBe("inventory-2026-11-13.csv");
  });

  it("says so when the server's file has no records", async () => {
    render(
      <CsvActions
        section={inventoryCsv}
        downloadFile={async () => ({ blob: new Blob(["﻿Plot No,Phone\r\n"]), filename: null })}
      />
    );
    await exportFile();
    expect(await screen.findByRole("alert")).toHaveTextContent("There are no plots to export.");
    expect(saveBlob).not.toHaveBeenCalled();
  });

  it("passes on the server's message when a server-built file would be too big", async () => {
    const tooBig = new ApiError(413, "More than 1,00,000 plots match. Narrow the filters and export in parts.", "export_too_large");
    render(<CsvActions section={inventoryCsv} downloadFile={vi.fn().mockRejectedValue(tooBig)} />);
    await exportFile();
    expect(await screen.findByRole("alert")).toHaveTextContent("More than 1,00,000 plots match. Narrow the filters");
    expect(saveBlob).not.toHaveBeenCalled();
  });

  it("finds the first record of a large server file without reading all of it", async () => {
    const header = "Plot No,Phone\r\n";
    const big = new Blob(["\ufeff", header, "C-1,9876543210\r\n".repeat(20000)]);
    expect(big.size).toBeGreaterThan(64 * 1024);
    const slice = vi.spyOn(big, "slice");
    render(<CsvActions section={inventoryCsv} downloadFile={async () => ({ blob: big, filename: null })} />);
    await exportFile();
    await waitFor(() => expect(saveBlob).toHaveBeenCalledWith(big, expect.stringMatching(/^inventory-/)));
    expect(slice).toHaveBeenCalledWith(0, 64 * 1024);
  });

  it("explains a failed server download", async () => {
    render(<CsvActions section={inventoryCsv} downloadFile={vi.fn().mockRejectedValue(new ApiError(500, "internal_error"))} />);
    await exportFile();
    expect(await screen.findByRole("alert")).toHaveTextContent("Export failed: the server hit an error.");
  });

  it("explains an empty or failed export instead of saving a file", async () => {
    const loadRows = vi.fn().mockResolvedValueOnce([]).mockRejectedValueOnce(new ApiError(500, "internal_error"));
    render(<CsvActions section={customersCsv} loadRows={loadRows} />);
    await exportFile();
    expect(await screen.findByRole("alert")).toHaveTextContent("There are no customers to export.");
    await userEvent.click(screen.getByRole("button", { name: /^Export \d+ fields$/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Export failed: the server hit an error.");
    expect(saveBlob).not.toHaveBeenCalled();
  });

  it("says when an export is too big instead of saving part of it", async () => {
    const loadRows = vi.fn().mockRejectedValue(new ExportTooLargeError("More than 1,00,000 records match."));
    render(<CsvActions section={customersCsv} loadRows={loadRows} />);
    await exportFile();
    expect(await screen.findByRole("alert")).toHaveTextContent("More than 1,00,000 records match.");
    expect(saveBlob).not.toHaveBeenCalled();
  });

  it("ignores a second click while an export is running", async () => {
    let finish: (rows: ApiCustomer[]) => void = () => {};
    const loadRows = vi.fn(() => new Promise<ApiCustomer[]>((resolve) => (finish = resolve)));
    render(<CsvActions section={customersCsv} loadRows={loadRows} />);
    await exportFile();
    expect(screen.getByRole("button", { name: "Exporting…" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Email" })).toBeDisabled();
    finish([customer]);
    await waitFor(() => expect(saveBlob).toHaveBeenCalledTimes(1));
    expect(loadRows).toHaveBeenCalledTimes(1);
  });

  it("cancelling a running export stops it and saves nothing", async () => {
    let finish: (rows: ApiCustomer[]) => void = () => {};
    let signal: AbortSignal | undefined;
    const loadRows = vi.fn((_token: string, _progress: unknown, s: AbortSignal) => {
      signal = s;
      return new Promise<ApiCustomer[]>((resolve) => (finish = resolve));
    });
    render(<CsvActions section={customersCsv} loadRows={loadRows} />);
    await exportFile();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(signal?.aborted).toBe(true);
    finish([customer]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(saveBlob).not.toHaveBeenCalled();
  });

  it("export-only sections have no Import button but still offer a sample", async () => {
    render(<CsvActions section={bookingsCsv} loadRows={async () => []} />);
    expect(screen.queryByRole("button", { name: "Import CSV" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Sample CSV" }));
    expect(saveBlob.mock.calls[0][1]).toBe("bookings-sample.csv");
  });

  it("falls back to a retry button if the toolbar crashes", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = {
      ...customersCsv,
      get noun(): string {
        throw new Error("boom");
      },
    } as CsvSection<ApiCustomer>;
    render(<CsvActions section={broken} loadRows={async () => []} />);
    expect(screen.getByRole("button", { name: /CSV tools failed/ })).toBeInTheDocument();
  });
});

describe("CsvActions import", () => {
  const user = () => userEvent.setup({ applyAccept: false });

  async function openWith(file: File, onImported = vi.fn()) {
    const u = user();
    render(<CsvActions section={customersCsv} loadRows={async () => []} onImported={onImported} />);
    await u.click(screen.getByRole("button", { name: "Import CSV" }));
    await u.upload(screen.getByLabelText("CSV file"), file);
    return u;
  }

  it("checks the file, imports it in one request and reloads the list", async () => {
    importRows.mockResolvedValue({ created: 1, updated: 0 });
    const onImported = vi.fn();
    const u = await openWith(csvFile("Full Name,Email,Phone\nArjun,arjun@example.com,98765\n"), onImported);

    expect(await screen.findByText("1 customer checked and ready to import.")).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Import 1 customer" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Import complete: 1 added, 0 updated.");
    expect(importRows).toHaveBeenCalledWith(
      "token",
      "customers",
      [{ row: 2, full_name: "Arjun", email: "arjun@example.com", phone: "98765" }],
      expect.stringMatching(/^[0-9a-f-]{36}$/)
    );
    expect(onImported).toHaveBeenCalledTimes(1);
  });

  it("blocks a file with problems and lists them by row", async () => {
    await openWith(csvFile("Full Name,Email,Phone\nArjun,bad,98765\n"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Row 2 · Email: Not a valid email address.");
    expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();
    expect(importRows).not.toHaveBeenCalled();
  });

  it("retries a network failure with the same idempotency key", async () => {
    importRows.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce({ created: 1, updated: 0 });
    const u = await openWith(csvFile("Full Name,Email,Phone\nArjun,arjun@example.com,98765\n"));
    await u.click(await screen.findByRole("button", { name: "Import 1 customer" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not reach the server");

    await u.click(screen.getByRole("button", { name: "Import 1 customer" }));
    await screen.findByRole("status");
    expect(importRows.mock.calls[1][3]).toBe(importRows.mock.calls[0][3]);
  });

  it("says when the server doesn't have the import endpoint yet", async () => {
    importRows.mockRejectedValue(new ApiError(404, "Not Found"));
    const u = await openWith(csvFile("Full Name,Email,Phone\nArjun,arjun@example.com,98765\n"));
    await u.click(await screen.findByRole("button", { name: "Import 1 customer" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("needs a server update");
    expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();
  });

  it("asks for CSV when given an Excel workbook", async () => {
    await openWith(csvFile("x", "customers.xlsx"));
    expect(await screen.findByRole("alert")).toHaveTextContent('Save As > "CSV UTF-8 (Comma delimited)"');
  });

  it("reads Excel's Windows-1252 CSV without garbling names", async () => {
    importRows.mockResolvedValue({ created: 1, updated: 0 });
    // "José" saved as Windows-1252: é is the single byte 0xE9.
    const bytes = new Uint8Array([...new TextEncoder().encode("Full Name,Email,Phone\nJos"), 0xe9, ...new TextEncoder().encode(",j@example.com,1\n")]);
    const u = await openWith(new File([bytes], "customers.csv"));
    await u.click(await screen.findByRole("button", { name: "Import 1 customer" }));
    await screen.findByRole("status");
    expect(importRows.mock.calls[0][2][0].full_name).toBe("José");
  });

  it("keeps UTF-8 text that happens to contain the replacement character", async () => {
    importRows.mockResolvedValue({ created: 1, updated: 0 });
    const u = await openWith(csvFile("Full Name,Email,Phone\nRavi � Kumar,r1@example.com,1\n"));
    await u.click(await screen.findByRole("button", { name: "Import 1 customer" }));
    await screen.findByRole("status");
    expect(importRows.mock.calls[0][2][0].full_name).toBe("Ravi � Kumar");
  });

  it("reads Excel's UTF-16 'Unicode Text' (tab-separated)", async () => {
    importRows.mockResolvedValue({ created: 1, updated: 0 });
    const content = "Full Name\tEmail\tPhone\r\nअर्जुन\tarjun16@example.com\t1\r\n";
    const bytes = new Uint8Array(2 + content.length * 2);
    bytes.set([0xff, 0xfe]);
    for (let i = 0; i < content.length; i++) {
      bytes[2 + i * 2] = content.charCodeAt(i) & 0xff;
      bytes[3 + i * 2] = content.charCodeAt(i) >> 8;
    }
    const u = await openWith(new File([bytes], "customers.txt"));
    await u.click(await screen.findByRole("button", { name: "Import 1 customer" }));
    await screen.findByRole("status");
    expect(importRows.mock.calls[0][2][0]).toMatchObject({ full_name: "अर्जुन", email: "arjun16@example.com" });
  });

  it("accepts a file without an extension when the browser says it is CSV", async () => {
    await openWith(new File(["Full Name,Email,Phone\nRavi,ravi.ext@example.com,1\n"], "download", { type: "text/csv" }));
    expect(await screen.findByText("1 customer checked and ready to import.")).toBeInTheDocument();
  });

  it("warns before importing the exact same file twice", async () => {
    importRows.mockResolvedValue({ created: 1, updated: 0 });
    const content = "Full Name,Email,Phone\nTwice,twice@example.com,1\n";
    const u = await openWith(csvFile(content));
    await u.click(await screen.findByRole("button", { name: "Import 1 customer" }));
    await screen.findByRole("status");
    expect(screen.queryByText(/already imported this exact file/)).not.toBeInTheDocument();

    await u.upload(screen.getByLabelText("CSV file"), csvFile(content));
    expect(await screen.findByText(/already imported this exact file/)).toBeInTheDocument();
    // Still allowed: the admin may really mean it.
    expect(screen.getByRole("button", { name: "Import 1 customer" })).toBeEnabled();
  });
});
