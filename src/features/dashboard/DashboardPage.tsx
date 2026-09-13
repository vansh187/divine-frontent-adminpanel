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
import { formatCompactCurrency } from "../../lib/format";
import {
  bookingFunnel,
  currentAdmin,
  customerBrokerTrend,
  dashboardSummary,
  revenueTrend,
  siteVisitTrend,
  siteVisits,
  todaySchedule,
} from "../../lib/mockData";

const GOLD = "#b8894f";
const GOLD_LIGHT = "#d9b27c";
const INK = "#29231a";
const FUNNEL_COLORS = ["#b8894f", "#c98a2c", "#2f9e6a", "#c85c4a", "#8a8172"];

export function DashboardPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text">
            Good Morning, {currentAdmin.name.split(" ")[0]} 👋
          </h1>
          <p className="mt-1 text-sm text-text-muted">Here&apos;s your work overview for today</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Customers" value={dashboardSummary.customers_total} hint="Total onboarded" />
        <StatCard label="Brokers" value={dashboardSummary.brokers_total} hint="Active channel partners" />
        <StatCard label="Pending KYC" value={dashboardSummary.pending_kyc} hint="Awaiting review" tone="gold" />
        <StatCard label="Approved Bookings" value={dashboardSummary.approved_bookings} hint="This quarter" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Gross Received" value={formatCompactCurrency(dashboardSummary.gross_received)} />
        <StatCard label="Approved Revenue" value={formatCompactCurrency(dashboardSummary.approved_revenue)} />
        <StatCard label="Refunded Amount" value={formatCompactCurrency(dashboardSummary.refunded_amount)} />
      </div>

      <Card className="relative overflow-hidden bg-sidebar p-8 text-white">
        <div className="relative z-10 max-w-lg">
          <p className="text-3xl font-bold leading-tight">
            People
            <br />
            Plots
            <br />
            <span className="text-gold-light">Possibilities</span>
          </p>
          <p className="mt-3 text-sm text-white/60">Together we build a better tomorrow.</p>
        </div>
        <div className="pointer-events-none absolute -bottom-20 -right-16 h-64 w-64 rounded-full bg-gold/10" />
        <div className="pointer-events-none absolute -top-10 right-24 h-40 w-40 rounded-full bg-gold/10" />
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-bold text-text">Today&apos;s Schedule</h3>
            <button className="text-xs font-semibold text-gold-dark hover:underline">View All</button>
          </div>
          <ol className="space-y-4">
            {todaySchedule.map((item, i) => (
              <li key={i} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <span className="h-2.5 w-2.5 rounded-full bg-gold" />
                  {i < todaySchedule.length - 1 && <span className="mt-1 h-full w-px flex-1 bg-border" />}
                </div>
                <div className="flex-1 pb-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-text">{item.title}</p>
                    <span className="rounded-full bg-info-bg px-2.5 py-0.5 text-xs font-semibold text-info">
                      {item.tag}
                    </span>
                  </div>
                  <p className="text-xs text-text-muted">{item.subtitle}</p>
                  <p className="mt-0.5 text-xs font-medium text-gold-dark">{item.time}</p>
                </div>
              </li>
            ))}
          </ol>
        </Card>

        <Card className="p-5">
          <h3 className="mb-4 text-sm font-bold text-text">Quick Actions</h3>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Log Site Visit", icon: "📍" },
              { label: "Mark Attendance", icon: "⏱️" },
              { label: "Apply for Leave", icon: "📝" },
              { label: "View Calendar", icon: "📅" },
            ].map((action) => (
              <button
                key={action.label}
                className="flex flex-col items-center gap-2 rounded-xl border border-border bg-surface-muted/60 px-3 py-4 text-center text-xs font-semibold text-text-muted transition-colors hover:border-gold hover:text-gold-dark"
              >
                <span className="text-lg">{action.icon}</span>
                {action.label}
              </button>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Customer &amp; Broker Growth" subtitle="Monthly new records">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={customerBrokerTrend} barGap={6}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e8e0d1" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: INK }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: INK }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 12, borderColor: "#e8e0d1", fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="customers" name="Customers" fill={GOLD} radius={[6, 6, 0, 0]} />
              <Bar dataKey="brokers" name="Brokers" fill={GOLD_LIGHT} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Site Visit Trend" subtitle="Customer vs broker channel">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={siteVisitTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e8e0d1" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: INK }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: INK }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 12, borderColor: "#e8e0d1", fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="customer" name="Customer" stroke={GOLD} strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="broker" name="Broker Channel" stroke="#4a7fc9" strokeWidth={2.5} dot={false} />
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

        <ChartCard title="Booking Funnel" subtitle="Payment received → approved / rejected">
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
                    {visit.project} · Plot {visit.plot}
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
