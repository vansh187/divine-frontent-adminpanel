import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartCard } from "../../components/charts/ChartCard";
import { PageHeader } from "../../components/ui/PageHeader";
import { Pagination } from "../../components/ui/Pagination";
import { SearchInput } from "../../components/ui/SearchInput";
import { StatCard } from "../../components/ui/StatCard";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Table, Td, Th, THead, Tr } from "../../components/ui/Table";
import {
  ApiError,
  getRevenueSummary,
  listRevenueTransactions,
  type ApiRevenueSummary,
  type ApiRevenueTransaction,
} from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { formatCompactCurrency, formatCurrency, formatDate } from "../../lib/format";

const PAGE_SIZE = 20;
const TREND_MONTHS = 6;

interface TrendPoint {
  month: string;
  revenue: number | null;
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function lastMonthRanges(count: number) {
  const now = new Date();
  const ranges: { label: string; date_from: string; date_to: string }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
    ranges.push({
      label: start.toLocaleDateString("en-US", { month: "short" }),
      date_from: toISODate(start),
      date_to: toISODate(end),
    });
  }
  return ranges;
}

export function RevenuePage() {
  const { accessToken } = useAuth();

  const [summary, setSummary] = useState<ApiRevenueSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [trendLoading, setTrendLoading] = useState(true);
  const [trendError, setTrendError] = useState<string | null>(null);
  const [trendWarning, setTrendWarning] = useState<string | null>(null);

  const [items, setItems] = useState<ApiRevenueTransaction[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    setSummaryLoading(true);
    setSummaryError(null);

    getRevenueSummary(accessToken)
      .then((res) => {
        if (cancelled) return;
        setSummary(res);
      })
      .catch((err) => {
        if (cancelled) return;
        setSummaryError(err instanceof ApiError ? err.message : "Failed to load revenue summary.");
      })
      .finally(() => {
        if (!cancelled) setSummaryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    setTrendLoading(true);
    setTrendError(null);
    setTrendWarning(null);

    const ranges = lastMonthRanges(TREND_MONTHS);

    Promise.allSettled(
      ranges.map((r) => getRevenueSummary(accessToken, { date_from: r.date_from, date_to: r.date_to }))
    )
      .then((results) => {
        if (cancelled) return;
        const failedMonths = ranges.filter((_, i) => results[i].status === "rejected").map((r) => r.label);

        if (failedMonths.length === ranges.length) {
          setTrendError("Failed to load revenue trend.");
          setTrend([]);
          return;
        }

        if (failedMonths.length > 0) {
          setTrendWarning(`Couldn't load data for ${failedMonths.join(", ")} — shown as a gap below.`);
        }

        setTrend(
          ranges.map((r, i) => {
            const result = results[i];
            const revenue =
              result.status === "fulfilled" ? result.value.captured_amount + result.value.cash_amount : null;
            return { month: r.label, revenue };
          })
        );
      })
      .finally(() => {
        if (!cancelled) setTrendLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    setListLoading(true);
    setListError(null);

    listRevenueTransactions(accessToken, {
      page,
      page_size: PAGE_SIZE,
      search: search || undefined,
    })
      .then((res) => {
        if (cancelled) return;
        setItems(res.items);
        setTotalItems(res.pagination.total_items);
        setTotalPages(Math.max(1, res.pagination.total_pages));
      })
      .catch((err) => {
        if (cancelled) return;
        setListError(err instanceof ApiError ? err.message : "Failed to load transactions.");
      })
      .finally(() => {
        if (!cancelled) setListLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, page, search]);

  return (
    <div>
      <PageHeader title="Revenue" subtitle="Revenue summary and transaction drill-down" />

      {summaryError && (
        <div className="mb-4 rounded-xl border border-danger/30 bg-danger-bg p-3 text-sm text-danger">
          {summaryError}
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Gross Received"
          value={summaryLoading ? "—" : formatCompactCurrency(summary?.gross_amount ?? 0)}
        />
        <StatCard
          label="Approved Revenue"
          value={
            summaryLoading
              ? "—"
              : formatCompactCurrency((summary?.captured_amount ?? 0) + (summary?.cash_amount ?? 0))
          }
          tone="gold"
        />
        <StatCard
          label="Refunded Amount"
          value={summaryLoading ? "—" : formatCompactCurrency(summary?.refunded_amount ?? 0)}
        />
      </div>

      <div className="mb-6">
        <ChartCard title="Revenue Trend" subtitle="Approved booking revenue by month">
          {trendError ? (
            <div className="flex h-[260px] items-center justify-center text-sm text-text-muted">{trendError}</div>
          ) : trendLoading ? (
            <div className="flex h-[260px] items-center justify-center text-sm text-text-muted">
              Loading trend...
            </div>
          ) : (
            <>
              {trendWarning && <p className="mb-2 text-xs text-warning">{trendWarning}</p>}
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8e0d1" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#29231a" }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 12, fill: "#29231a" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => formatCompactCurrency(v)}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, borderColor: "#e8e0d1", fontSize: 12 }}
                    formatter={(v) => (v == null ? "No data" : formatCompactCurrency(Number(v)))}
                  />
                  <Bar dataKey="revenue" fill="#b8894f" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </>
          )}
        </ChartCard>
      </div>

      <div className="mb-4">
        <SearchInput
          placeholder="Search by booking ID, customer or project"
          className="max-w-md"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
      </div>

      {listError && (
        <div className="mb-4 rounded-xl border border-danger/30 bg-danger-bg p-3 text-sm text-danger">
          {listError}
        </div>
      )}

      <Table>
        <THead>
          <Th>Transaction</Th>
          <Th>Booking</Th>
          <Th>Customer</Th>
          <Th>Project</Th>
          <Th>Amount</Th>
          <Th>Method</Th>
          <Th>Status</Th>
          <Th>Date</Th>
        </THead>
        <tbody>
          {listLoading ? (
            <tr>
              <td colSpan={8} className="px-4 py-10 text-center text-sm text-text-muted">
                Loading transactions...
              </td>
            </tr>
          ) : (
            <>
              {items.map((t) => (
                <Tr key={t.transaction_id}>
                  <Td className="font-medium text-text-muted">{t.transaction_id.slice(0, 8).toUpperCase()}</Td>
                  <Td>{t.booking_id ?? "—"}</Td>
                  <Td className="font-medium">{t.customer_name ?? t.customer_id}</Td>
                  <Td>{t.project_name ?? "—"}</Td>
                  <Td className="font-semibold">{formatCurrency(t.amount)}</Td>
                  <Td>{t.method.toUpperCase()}</Td>
                  <Td>
                    <StatusBadge status={t.status.toUpperCase()} />
                  </Td>
                  <Td className="text-text-muted">{formatDate(t.created_at)}</Td>
                </Tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-text-muted">
                    No transactions match your filters.
                  </td>
                </tr>
              )}
            </>
          )}
        </tbody>
      </Table>

      <Pagination page={page} pages={totalPages} total={totalItems} pageSize={PAGE_SIZE} onPageChange={setPage} />
    </div>
  );
}
