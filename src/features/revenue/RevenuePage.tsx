import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartCard } from "../../components/charts/ChartCard";
import { PageHeader } from "../../components/ui/PageHeader";
import { Pagination } from "../../components/ui/Pagination";
import { SearchInput } from "../../components/ui/SearchInput";
import { StatCard } from "../../components/ui/StatCard";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Table, Td, Th, THead, Tr } from "../../components/ui/Table";
import { formatCompactCurrency, formatCurrency } from "../../lib/format";
import { dashboardSummary, revenueTransactions, revenueTrend } from "../../lib/mockData";

const PAGE_SIZE = 6;

export function RevenuePage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(
    () =>
      revenueTransactions.filter(
        (t) =>
          t.customerName.toLowerCase().includes(search.toLowerCase()) ||
          t.bookingId.toLowerCase().includes(search.toLowerCase()) ||
          t.project.toLowerCase().includes(search.toLowerCase())
      ),
    [search]
  );

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <PageHeader title="Revenue" subtitle="Revenue summary and transaction drill-down" />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Gross Received" value={formatCompactCurrency(dashboardSummary.gross_received)} />
        <StatCard label="Approved Revenue" value={formatCompactCurrency(dashboardSummary.approved_revenue)} tone="gold" />
        <StatCard label="Refunded Amount" value={formatCompactCurrency(dashboardSummary.refunded_amount)} />
      </div>

      <div className="mb-6">
        <ChartCard title="Revenue Trend" subtitle="Approved booking revenue by month">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={revenueTrend}>
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
                formatter={(v) => formatCompactCurrency(Number(v))}
              />
              <Bar dataKey="revenue" fill="#b8894f" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="mb-4">
        <SearchInput
          placeholder="Search by booking ID, customer or project"
          className="max-w-md"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>

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
          {pageItems.map((t) => (
            <Tr key={t.id}>
              <Td className="font-medium text-text-muted">{t.id}</Td>
              <Td>{t.bookingId}</Td>
              <Td className="font-medium">{t.customerName}</Td>
              <Td>{t.project}</Td>
              <Td className="font-semibold">{formatCurrency(t.amount)}</Td>
              <Td>{t.method}</Td>
              <Td>
                <StatusBadge status={t.status} />
              </Td>
              <Td className="text-text-muted">{t.date}</Td>
            </Tr>
          ))}
        </tbody>
      </Table>

      <Pagination page={page} pages={pages} total={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
    </div>
  );
}
