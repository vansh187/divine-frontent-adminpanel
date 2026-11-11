export interface PagedResponse<T> {
  items: T[];
  pagination: { total_pages: number };
}

export interface FetchPagesOptions {
  /** Stop after this many items (the result is trimmed to it). */
  maxItems?: number;
  /** Stop after this many pages. */
  maxPages?: number;
}

/**
 * Walks a paginated list endpoint from page 1. `truncated` is true when a limit
 * stopped the walk while the server still had more pages.
 */
export async function fetchPages<T>(
  fetchPage: (page: number) => Promise<PagedResponse<T>>,
  { maxItems = Infinity, maxPages = Infinity }: FetchPagesOptions = {}
): Promise<{ items: T[]; truncated: boolean }> {
  const items: T[] = [];
  for (let page = 1; ; page++) {
    const res = await fetchPage(page);
    items.push(...res.items);
    // An empty page also ends the walk, in case total_pages is wrong.
    if (res.items.length === 0 || page >= res.pagination.total_pages) {
      return { items: items.slice(0, maxItems), truncated: items.length > maxItems };
    }
    if (items.length >= maxItems || page >= maxPages) {
      return { items: items.slice(0, maxItems), truncated: true };
    }
  }
}
