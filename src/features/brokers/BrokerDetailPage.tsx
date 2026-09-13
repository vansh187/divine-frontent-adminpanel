import { useParams } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Avatar } from "../../components/ui/Avatar";
import { BackLink } from "../../components/ui/BackLink";
import { Card } from "../../components/ui/Card";
import { StatCard } from "../../components/ui/StatCard";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Table, Td, Th, THead, Tr } from "../../components/ui/Table";
import { formatCompactCurrency } from "../../lib/format";
import { brokers, siteVisits } from "../../lib/mockData";

const monthlyPerformance = [
  { month: "Apr", visits: 5 },
  { month: "May", visits: 8 },
  { month: "Jun", visits: 6 },
  { month: "Jul", visits: 11 },
  { month: "Aug", visits: 9 },
  { month: "Sep", visits: 9 },
];

export function BrokerDetailPage() {
  const { id } = useParams();
  const broker = brokers.find((b) => b.id === id) ?? brokers[0];
  const brokerVisits = siteVisits.filter((v) => v.brokerName === broker.name);

  return (
    <div>
      <BackLink to="/admin/brokers" label="Back to brokers" />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar name={broker.name} className="h-14 w-14 text-base" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-text">{broker.name}</h1>
              <StatusBadge status={broker.status} />
            </div>
            <p className="text-sm text-text-muted">
              {broker.id} · {broker.agency}
            </p>
          </div>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Leads Sourced" value={broker.leadsSourced} />
        <StatCard label="Site Visits" value={broker.siteVisitsSourced} />
        <StatCard label="Bookings Converted" value={broker.bookingsConverted} />
        <StatCard label="Commission Pending" value={formatCompactCurrency(broker.commissionPending)} tone="gold" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-5">
            <h3 className="mb-4 text-sm font-bold text-text">Monthly Site Visits Sourced</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyPerformance}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e8e0d1" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#29231a" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: "#29231a" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 12, borderColor: "#e8e0d1", fontSize: 12 }} />
                <Bar dataKey="visits" fill="#b8894f" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card className="p-5">
            <h3 className="mb-4 text-sm font-bold text-text">Broker-Sourced Site Visits</h3>
            <Table>
              <THead>
                <Th>Customer</Th>
                <Th>Project / Plot</Th>
                <Th>Scheduled</Th>
                <Th>Status</Th>
              </THead>
              <tbody>
                {brokerVisits.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-sm text-text-muted">
                      No site visits recorded for this broker yet.
                    </td>
                  </tr>
                )}
                {brokerVisits.map((v) => (
                  <Tr key={v.id}>
                    <Td className="font-medium">{v.customerName}</Td>
                    <Td>
                      {v.project} · {v.plot}
                    </Td>
                    <Td className="text-text-muted">{v.scheduledAt}</Td>
                    <Td>
                      <StatusBadge status={v.status} />
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <h3 className="mb-4 text-sm font-bold text-text">Contact Details</h3>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs text-text-muted">Agency</dt>
                <dd className="font-medium text-text">{broker.agency}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted">Email</dt>
                <dd className="font-medium text-text">{broker.email}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted">Phone</dt>
                <dd className="font-medium text-text">{broker.phone}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted">Joined</dt>
                <dd className="font-medium text-text">{broker.joinedAt}</dd>
              </div>
            </dl>
          </Card>

          <Card className="p-5">
            <h3 className="mb-4 text-sm font-bold text-text">Commission Summary</h3>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-text-muted">Earned to date</dt>
                <dd className="font-semibold text-text">{formatCompactCurrency(broker.commissionEarned)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-text-muted">Pending settlement</dt>
                <dd className="font-semibold text-gold-dark">{formatCompactCurrency(broker.commissionPending)}</dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}
