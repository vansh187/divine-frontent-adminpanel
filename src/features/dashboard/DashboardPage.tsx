import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useNavigate } from "react-router-dom";
import { ChartCard } from "../../components/charts/ChartCard";
import { Avatar } from "../../components/ui/Avatar";
import { Card } from "../../components/ui/Card";
import { StatCard } from "../../components/ui/StatCard";
import {
  ApiError,
  getRevenueSummary,
  listBookings,
  listBrokers,
  listCustomers,
  listVisits,
  type ApiBroker,
  type ApiCustomer,
  type ApiVisit,
  type BookingStatus,
} from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { formatCompactCurrency } from "../../lib/format";
import { deriveStatus, projectLabel, scheduleLabel, visitTimestamp } from "../../lib/siteVisitDisplay";

const UPCOMING_VISITS_LIMIT = 4;
const UPCOMING_VISITS_WINDOW_DAYS = 2;
const TREND_MONTHS = 6;
const MAX_TREND_RECORDS = 500;
const TREND_PAGE_SIZE = 100;

const GOLD = "#b8894f";
const GOLD_LIGHT = "#d9b27c";
const INK = "#29231a";
const FUNNEL_COLORS = ["#c98a2c", "#2f9e6a", "#c85c4a", "#8a8172"];

const FUNNEL_STAGES: { status: BookingStatus; label: string }[] = [
  { status: "pending_kyc_review", label: "Pending KYC Review" },
  { status: "booked", label: "Booked" },
  { status: "rejected", label: "Rejected" },
  { status: "cancelled", label: "Cancelled" },
];

interface MonthRange {
  label: string;
  date_from: string;
  date_to: string;
}

interface RevenueTrendPoint {
  month: string;
  revenue: number | null;
}

interface GrowthPoint {
  month: string;
  customers: number;
  brokers: number;
}

interface VisitTrendPoint {
  month: string;
  customer: number;
  broker: number;
}

interface FunnelPoint {
  stage: string;
  value: number;
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function lastMonthRanges(count: number): MonthRange[] {
  const now = new Date();
  const ranges: MonthRange[] = [];
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

function monthIndexFor(dateStr: string | null | undefined, ranges: MonthRange[]): number {
  if (!dateStr) return -1;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return -1;
  return ranges.findIndex((r) => d >= new Date(r.date_from) && d <= new Date(`${r.date_to}T23:59:59`));
}

/** Pages through a list endpoint (newest first) up to MAX_TREND_RECORDS, for client-side month bucketing. */
async function fetchRecent<T>(
  fetchPage: (page: number) => Promise<{ items: T[]; pagination: { total_pages: number } }>
): Promise<T[]> {
  const items: T[] = [];
  let page = 1;
  for (;;) {
    const res = await fetchPage(page);
    items.push(...res.items);
    if (items.length >= MAX_TREND_RECORDS || res.items.length === 0 || page >= res.pagination.total_pages) break;
    page += 1;
  }
  return items.slice(0, MAX_TREND_RECORDS);
}

export function DashboardPage() {
  const { accessToken, admin } = useAuth();
  const navigate = useNavigate();

  const [customersTotal, setCustomersTotal] = useState<number | null>(null);
  const [brokersTotal, setBrokersTotal] = useState<number | null>(null);
  const [countsError, setCountsError] = useState(false);

  const [pendingKyc, setPendingKyc] = useState<number | null>(null);
  const [approvedBookings, setApprovedBookings] = useState<number | null>(null);
  const [funnelData, setFunnelData] = useState<FunnelPoint[]>([]);
  const [funnelLoading, setFunnelLoading] = useState(true);
  const [funnelError, setFunnelError] = useState<string | null>(null);

  const [upcomingVisits, setUpcomingVisits] = useState<ApiVisit[]>([]);
  const [visitsLoading, setVisitsLoading] = useState(true);
  const [visitsError, setVisitsError] = useState<string | null>(null);

  const [revenueTrend, setRevenueTrend] = useState<RevenueTrendPoint[]>([]);
  const [revenueTrendLoading, setRevenueTrendLoading] = useState(true);
  const [revenueTrendError, setRevenueTrendError] = useState<string | null>(null);

  const [growthData, setGrowthData] = useState<GrowthPoint[]>([]);
  const [growthLoading, setGrowthLoading] = useState(true);
  const [growthError, setGrowthError] = useState<string | null>(null);

  const [visitTrendData, setVisitTrendData] = useState<VisitTrendPoint[]>([]);
  const [visitTrendLoading, setVisitTrendLoading] = useState(true);
  const [visitTrendError, setVisitTrendError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    setCountsError(false);

    Promise.allSettled([
      listCustomers(accessToken, { page: 1, page_size: 1 }),
      listBrokers(accessToken, { page: 1, page_size: 1 }),
    ]).then(([customersResult, brokersResult]) => {
      if (cancelled) return;

      if (customersResult.status === "fulfilled") {
        setCustomersTotal(customersResult.value.pagination.total_items);
      } else {
        setCustomersTotal(null);
        setCountsError(true);
      }

      if (brokersResult.status === "fulfilled") {
        setBrokersTotal(brokersResult.value.pagination.total_items);
      } else {
        setBrokersTotal(null);
        setCountsError(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    setFunnelLoading(true);
    setFunnelError(null);

    Promise.allSettled(
      FUNNEL_STAGES.map((stage) => listBookings(accessToken, { status: stage.status, page_size: 1 }))
    ).then((results) => {
      if (cancelled) return;

      if (results.every((r) => r.status === "rejected")) {
        setFunnelError("Failed to load booking funnel.");
        setFunnelData([]);
        setPendingKyc(null);
        setApprovedBookings(null);
        return;
      }

      const points = FUNNEL_STAGES.map((stage, i) => {
        const result = results[i];
        return { stage: stage.label, value: result.status === "fulfilled" ? result.value.pagination.total_items : 0 };
      });
      setFunnelData(points);
      setPendingKyc(results[0].status === "fulfilled" ? results[0].value.pagination.total_items : null);
      setApprovedBookings(results[1].status === "fulfilled" ? results[1].value.pagination.total_items : null);
    }).finally(() => {
      if (!cancelled) setFunnelLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    setVisitsLoading(true);
    setVisitsError(null);

    listVisits(accessToken, { page: 1, page_size: 50, sort: "visit_date" })
      .then((res) => {
        if (cancelled) return;

        const rangeStart = new Date();
        rangeStart.setHours(0, 0, 0, 0);
        const rangeEnd = new Date(rangeStart);
        rangeEnd.setDate(rangeEnd.getDate() + UPCOMING_VISITS_WINDOW_DAYS);

        const upcoming = res.items
          .filter((v) => {
            if (deriveStatus(v) !== "scheduled" || !v.visit_date) return false;
            const date = new Date(v.visit_date);
            return !Number.isNaN(date.getTime()) && date >= rangeStart && date < rangeEnd;
          })
          .sort((a, b) => visitTimestamp(a) - visitTimestamp(b))
          .slice(0, UPCOMING_VISITS_LIMIT);

        setUpcomingVisits(upcoming);
      })
      .catch((err) => {
        if (cancelled) return;
        setVisitsError(err instanceof ApiError ? err.message : "Failed to load upcoming site visits.");
      })
      .finally(() => {
        if (!cancelled) setVisitsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    setRevenueTrendLoading(true);
    setRevenueTrendError(null);

    const ranges = lastMonthRanges(TREND_MONTHS);

    Promise.allSettled(
      ranges.map((r) => getRevenueSummary(accessToken, { date_from: r.date_from, date_to: r.date_to }))
    ).then((results) => {
      if (cancelled) return;

      if (results.every((r) => r.status === "rejected")) {
        setRevenueTrendError("Failed to load revenue trend.");
        setRevenueTrend([]);
        return;
      }

      setRevenueTrend(
        ranges.map((r, i) => {
          const result = results[i];
          const revenue =
            result.status === "fulfilled" ? result.value.captured_amount + result.value.cash_amount : null;
          return { month: r.label, revenue };
        })
      );
    }).finally(() => {
      if (!cancelled) setRevenueTrendLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    setGrowthLoading(true);
    setGrowthError(null);

    const ranges = lastMonthRanges(TREND_MONTHS);

    Promise.all([
      fetchRecent<ApiCustomer>((page) =>
        listCustomers(accessToken, { page, page_size: TREND_PAGE_SIZE, sort: "-created_at" })
      ),
      fetchRecent<ApiBroker>((page) =>
        listBrokers(accessToken, { page, page_size: TREND_PAGE_SIZE, sort: "-created_at" })
      ),
    ])
      .then(([customers, brokers]) => {
        if (cancelled) return;
        const customerCounts = ranges.map(() => 0);
        const brokerCounts = ranges.map(() => 0);
        for (const c of customers) {
          const i = monthIndexFor(c.created_at, ranges);
          if (i >= 0) customerCounts[i] += 1;
        }
        for (const b of brokers) {
          const i = monthIndexFor(b.created_at, ranges);
          if (i >= 0) brokerCounts[i] += 1;
        }
        setGrowthData(ranges.map((r, i) => ({ month: r.label, customers: customerCounts[i], brokers: brokerCounts[i] })));
      })
      .catch((err) => {
        if (cancelled) return;
        setGrowthError(err instanceof ApiError ? err.message : "Failed to load growth trend.");
      })
      .finally(() => {
        if (!cancelled) setGrowthLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    setVisitTrendLoading(true);
    setVisitTrendError(null);

    const ranges = lastMonthRanges(TREND_MONTHS);

    fetchRecent<ApiVisit>((page) => listVisits(accessToken, { page, page_size: TREND_PAGE_SIZE, sort: "-created_at" }))
      .then((visits) => {
        if (cancelled) return;
        const customerCounts = ranges.map(() => 0);
        const brokerCounts = ranges.map(() => 0);
        for (const v of visits) {
          const i = monthIndexFor(v.created_at, ranges);
          if (i < 0) continue;
          if (v.origin_type === "CUSTOMER") customerCounts[i] += 1;
          else brokerCounts[i] += 1;
        }
        setVisitTrendData(
          ranges.map((r, i) => ({ month: r.label, customer: customerCounts[i], broker: brokerCounts[i] }))
        );
      })
      .catch((err) => {
        if (cancelled) return;
        setVisitTrendError(err instanceof ApiError ? err.message : "Failed to load site visit trend.");
      })
      .finally(() => {
        if (!cancelled) setVisitTrendLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  function openVisit(visit: ApiVisit) {
    sessionStorage.setItem(`dvi_visit_${visit.id}`, JSON.stringify(visit));
    navigate(`/admin/site-visits/${visit.id}`, { state: { visit } });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text">
            Good Morning, {admin?.fullName || admin?.email || "Admin"}
          </h1>
          <p className="mt-1 text-sm text-text-muted">Here&apos;s your work overview for today</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Customers"
          value={customersTotal ?? (countsError ? "-" : "...")}
          hint={countsError && customersTotal === null ? "Could not refresh" : "Total records"}
        />
        <StatCard
          label="Channel Partners"
          value={brokersTotal ?? (countsError ? "-" : "...")}
          hint={countsError && brokersTotal === null ? "Could not refresh" : "Total records"}
        />
        <StatCard
          label="Pending KYC"
          value={pendingKyc ?? (funnelError ? "-" : "...")}
          hint={funnelError && pendingKyc === null ? "Could not refresh" : "Awaiting review"}
          tone="gold"
        />
        <StatCard
          label="Approved Bookings"
          value={approvedBookings ?? (funnelError ? "-" : "...")}
          hint={funnelError && approvedBookings === null ? "Could not refresh" : "Total booked"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Customer &amp; Channel Partner Growth" subtitle="Monthly new records">
          {growthError ? (
            <div className="flex h-[240px] items-center justify-center text-sm text-text-muted">{growthError}</div>
          ) : growthLoading ? (
            <div className="flex h-[240px] items-center justify-center text-sm text-text-muted">Loading...</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={growthData} barGap={6}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e8e0d1" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: INK }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: INK }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 12, borderColor: "#e8e0d1", fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="customers" name="Customers" fill={GOLD} radius={[6, 6, 0, 0]} />
                <Bar dataKey="brokers" name="Channel Partners" fill={GOLD_LIGHT} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Site Visit Trend" subtitle="Customer vs channel partner">
          {visitTrendError ? (
            <div className="flex h-[240px] items-center justify-center text-sm text-text-muted">
              {visitTrendError}
            </div>
          ) : visitTrendLoading ? (
            <div className="flex h-[240px] items-center justify-center text-sm text-text-muted">Loading...</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={visitTrendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e8e0d1" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: INK }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: INK }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 12, borderColor: "#e8e0d1", fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="customer" name="Customer" stroke={GOLD} strokeWidth={2.5} dot={false} />
                <Line
                  type="monotone"
                  dataKey="broker"
                  name="Channel Partner"
                  stroke="#4a7fc9"
                  strokeWidth={2.5}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Revenue Trend" subtitle="Approved booking revenue by month">
          {revenueTrendError ? (
            <div className="flex h-[240px] items-center justify-center text-sm text-text-muted">
              {revenueTrendError}
            </div>
          ) : revenueTrendLoading ? (
            <div className="flex h-[240px] items-center justify-center text-sm text-text-muted">Loading...</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={revenueTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e8e0d1" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: INK }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 12, fill: INK }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => formatCompactCurrency(v)}
                />
                <Tooltip
                  contentStyle={{ borderRadius: 12, borderColor: "#e8e0d1", fontSize: 12 }}
                  formatter={(v) => (v == null ? "No data" : formatCompactCurrency(Number(v)))}
                />
                <Bar dataKey="revenue" name="Revenue" fill={GOLD} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Booking Funnel" subtitle="Current bookings by status">
          {funnelError ? (
            <div className="flex h-[240px] items-center justify-center text-sm text-text-muted">{funnelError}</div>
          ) : funnelLoading ? (
            <div className="flex h-[240px] items-center justify-center text-sm text-text-muted">Loading...</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={funnelData} layout="vertical" margin={{ left: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e8e0d1" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12, fill: INK }} axisLine={false} tickLine={false} />
                <YAxis
                  type="category"
                  dataKey="stage"
                  tick={{ fontSize: 11, fill: INK }}
                  axisLine={false}
                  tickLine={false}
                  width={140}
                />
                <Tooltip contentStyle={{ borderRadius: 12, borderColor: "#e8e0d1", fontSize: 12 }} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                  {funnelData.map((_, i) => (
                    <Cell key={i} fill={FUNNEL_COLORS[i % FUNNEL_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-bold text-text">Upcoming Site Visits</h3>
          <button
            onClick={() => navigate("/admin/site-visits")}
            className="text-xs font-semibold text-gold-dark hover:underline"
          >
            View All
          </button>
        </div>

        {visitsLoading && <p className="py-6 text-center text-sm text-text-muted">Loading site visits...</p>}

        {!visitsLoading && visitsError && (
          <p className="py-6 text-center text-sm text-text-muted">{visitsError}</p>
        )}

        {!visitsLoading && !visitsError && (
          <div className="space-y-3">
            {upcomingVisits.map((visit) => (
              <div
                key={visit.id}
                onClick={() => openVisit(visit)}
                className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border p-3 hover:bg-surface-muted"
              >
                <div className="flex items-center gap-3">
                  <Avatar name={visit.customer_name} />
                  <div>
                    <p className="text-sm font-semibold text-text">{visit.customer_name}</p>
                    <p className="text-xs text-text-muted">
                      {projectLabel(visit.project_name)}
                      {visit.plot_number ? ` - Plot ${visit.plot_number}` : ""}
                    </p>
                  </div>
                </div>
                <p className="text-xs font-medium text-text-muted">{scheduleLabel(visit)}</p>
              </div>
            ))}
            {upcomingVisits.length === 0 && (
              <p className="py-6 text-center text-sm text-text-muted">
                No site visits scheduled in the next {UPCOMING_VISITS_WINDOW_DAYS} days.
              </p>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
