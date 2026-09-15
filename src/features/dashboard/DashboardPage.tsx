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
import { ChartCard } from "../../components/charts/ChartCard";
import { Avatar } from "../../components/ui/Avatar";
import { Card } from "../../components/ui/Card";
import { StatCard } from "../../components/ui/StatCard";
import { listBrokers, listCustomers } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { formatCompactCurrency } from "../../lib/format";
import {
  bookingFunnel,
  customerBrokerTrend,
  dashboardSummary,
  revenueTrend,
  siteVisitTrend,
  siteVisits,
} from "../../lib/mockData";

const GOLD = "#b8894f";
const GOLD_LIGHT = "#d9b27c";
const INK = "#29231a";
const FUNNEL_COLORS = ["#b8894f", "#c98a2c", "#2f9e6a", "#c85c4a", "#8a8172"];

export function DashboardPage() {
  const { accessToken, admin } = useAuth();
  const [customersTotal, setCustomersTotal] = useState<number | null>(null);
  const [brokersTotal, setBrokersTotal] = useState<number | null>(null);
  const [countsError, setCountsError] = useState(false);

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
        <StatCard label="Pending KYC" value={dashboardSummary.pending_kyc} hint="Awaiting review" tone="gold" />
        <StatCard label="Approved Bookings" value={dashboardSummary.approved_bookings} hint="This quarter" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Gross Received" value={formatCompactCurrency(dashboardSummary.gross_received)} />
        <StatCard label="Approved Revenue" value={formatCompactCurrency(dashboardSummary.approved_revenue)} />
        <StatCard label="Refunded Amount" value={formatCompactCurrency(dashboardSummary.refunded_amount)} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Customer &amp; Channel Partner Growth" subtitle="Monthly new records">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={customerBrokerTrend} barGap={6}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e8e0d1" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: INK }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: INK }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 12, borderColor: "#e8e0d1", fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="customers" name="Customers" fill={GOLD} radius={[6, 6, 0, 0]} />
              <Bar dataKey="brokers" name="Channel Partners" fill={GOLD_LIGHT} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Site Visit Trend" subtitle="Customer vs channel partner">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={siteVisitTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e8e0d1" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: INK }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: INK }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 12, borderColor: "#e8e0d1", fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="customer" name="Customer" stroke={GOLD} strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="broker" name="Channel Partner" stroke="#4a7fc9" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Revenue Trend" subtitle="Approved booking revenue by month">
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
                formatter={(v) => formatCompactCurrency(Number(v))}
              />
              <Bar dataKey="revenue" name="Revenue" fill={GOLD} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Booking Funnel" subtitle="Payment received to approved / rejected">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={bookingFunnel} layout="vertical" margin={{ left: 24 }}>
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
                {bookingFunnel.map((_, i) => (
                  <Cell key={i} fill={FUNNEL_COLORS[i % FUNNEL_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-bold text-text">Upcoming Site Visits</h3>
          <button className="text-xs font-semibold text-gold-dark hover:underline">View All</button>
        </div>
        <div className="space-y-3">
          {siteVisits.slice(0, 4).map((visit) => (
            <div key={visit.id} className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
              <div className="flex items-center gap-3">
                <Avatar name={visit.customerName} />
                <div>
                  <p className="text-sm font-semibold text-text">{visit.customerName}</p>
                  <p className="text-xs text-text-muted">
                    {visit.project} - Plot {visit.plot}
                  </p>
                </div>
              </div>
              <p className="text-xs font-medium text-text-muted">{visit.scheduledAt}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
