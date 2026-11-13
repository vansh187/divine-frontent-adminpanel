import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, type ApiCustomer } from "../../lib/api";
import { CsvActions } from "./CsvActions";
import type { CsvSection } from "./csvModel";
import { bookingsCsv, customersCsv } from "./sections";

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
});

describe("CsvActions export and sample", () => {
  it("exports every loaded row once, as a dated UTF-8 file", async () => {
    const loadRows = vi.fn(async () => [customer, customer, { ...customer, id: "c2", email: "neha@example.com" }]);
    render(<CsvActions section={customersCsv} loadRows={loadRows} />);
    await userEvent.click(screen.getByRole("button", { name: "Export CSV" }));

    await waitFor(() => expect(saveBlob).toHaveBeenCalledTimes(1));
    expect(loadRows).toHaveBeenCalledWith("token", expect.any(Function), expect.any(AbortSignal));
    expect(saveBlob.mock.calls[0][1]).toMatch(/^customers-\d{4}-\d{2}-\d{2}\.csv$/);
    const content = await savedText();
    expect(content.split("\r\n").filter(Boolean)).toHaveLength(3);
    // Byte-order mark, so Excel reads the file as UTF-8 (Blob.text() hides it).
    const bytes = new Uint8Array(await (saveBlob.mock.calls[0][0] as Blob).arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it("explains an empty or failed export instead of saving a file", async () => {
    const loadRows = vi.fn().mockResolvedValueOnce([]).mockRejectedValueOnce(new ApiError(500, "internal_error"));
    render(<CsvActions section={customersCsv} loadRows={loadRows} />);
    await userEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No customers match the current filters");
    await userEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Export failed: internal_error");
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
});
