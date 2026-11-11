import { describe, expect, it, vi } from "vitest";
import { fetchPages } from "./pagination";

/** A fake list endpoint: `pages[i]` is page i+1; total_pages is reported as given. */
function endpoint(pages: number[][], totalPages = pages.length) {
  return vi.fn(async (page: number) => ({ items: pages[page - 1] ?? [], pagination: { total_pages: totalPages } }));
}

describe("fetchPages", () => {
  it("collects every page and reports nothing truncated", async () => {
    const fetchPage = endpoint([[1, 2], [3, 4], [5]]);
    await expect(fetchPages(fetchPage)).resolves.toEqual({ items: [1, 2, 3, 4, 5], truncated: false });
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it("stops at an empty page even if total_pages says there are more", async () => {
    const fetchPage = endpoint([[1], []], 50);
    await expect(fetchPages(fetchPage)).resolves.toEqual({ items: [1], truncated: false });
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it("handles zero results", async () => {
    await expect(fetchPages(endpoint([[]], 0))).resolves.toEqual({ items: [], truncated: false });
  });

  it("stops at maxPages and reports truncation", async () => {
    const fetchPage = endpoint([[1], [2], [3], [4]]);
    await expect(fetchPages(fetchPage, { maxPages: 2 })).resolves.toEqual({ items: [1, 2], truncated: true });
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it("is not truncated when maxPages is exactly the last page", async () => {
    await expect(fetchPages(endpoint([[1], [2]]), { maxPages: 2 })).resolves.toEqual({ items: [1, 2], truncated: false });
  });

  it("trims to maxItems (dashboard behaviour) and reports truncation", async () => {
    const fetchPage = endpoint([[1, 2, 3], [4, 5, 6], [7]]);
    await expect(fetchPages(fetchPage, { maxItems: 4 })).resolves.toEqual({ items: [1, 2, 3, 4], truncated: true });
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it("is not truncated when the last page lands exactly on maxItems", async () => {
    await expect(fetchPages(endpoint([[1, 2], [3, 4]]), { maxItems: 4 })).resolves.toEqual({
      items: [1, 2, 3, 4],
      truncated: false,
    });
  });

  it("passes errors through", async () => {
    const fetchPage = vi.fn(async () => {
      throw new Error("boom");
    });
    await expect(fetchPages(fetchPage)).rejects.toThrow("boom");
  });
});
