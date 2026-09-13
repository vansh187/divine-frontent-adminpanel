import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "../../components/ui/PageHeader";
import { Pagination } from "../../components/ui/Pagination";
import { SearchInput } from "../../components/ui/SearchInput";
import { Select } from "../../components/ui/Select";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Table, Td, Th, THead, Tr } from "../../components/ui/Table";
import { formatCurrency } from "../../lib/format";
import { settlements } from "../../lib/mockData";

const PAGE_SIZE = 6;

export function SettlementsListPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [page, setPage] = useState(1);

  const filtered = useMemo(
    () =>
      settlements.filter((s) => {
        const matchesSearch =
          s.brokerName.toLowerCase().includes(search.toLowerCase()) ||
          s.bookingId.toLowerCase().includes(search.toLowerCase());
        const matchesStatus = status === "ALL" || s.status === status;
        return matchesSearch && matchesStatus;
      }),
    [search, status]
  );

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <PageHeader title="Channel Partner Settlements" subtitle="Finance/admin commission review queue" />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput
          placeholder="Search by channel partner or booking ID"
          className="flex-1 min-w-[220px]"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="ALL">All statuses</option>
          <option value="PENDING">Pending</option>
          <option value="UNDER_REVIEW">Under Review</option>
          <option value="APPROVED">Approved</option>
          <option value="ON_HOLD">On Hold</option>
          <option value="REJECTED">Rejected</option>
          <option value="PAID">Paid</option>
          <option value="REVERSED">Reversed</option>
        </Select>
      </div>

      <Table>
        <THead>
          <Th>Settlement ID</Th>
          <Th>Channel Partner</Th>
          <Th>Booking / Project</Th>
          <Th>Commission</Th>
          <Th>Status</Th>
          <Th>Created</Th>
        </THead>
        <tbody>
          {pageItems.map((s) => (
            <Tr key={s.id} onClick={() => navigate(`/admin/broker-settlements/${s.id}`)}>
              <Td className="font-medium text-text-muted">{s.id}</Td>
              <Td className="font-medium">{s.brokerName}</Td>
              <Td>
                {s.bookingId} · {s.project}
              </Td>
              <Td className="font-semibold">{formatCurrency(s.commissionAmount)}</Td>
              <Td>
                <StatusBadge status={s.status} />
              </Td>
              <Td className="text-text-muted">{s.createdAt}</Td>
            </Tr>
          ))}
          {pageItems.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-10 text-center text-sm text-text-muted">
                No settlements match your filters.
              </td>
            </tr>
          )}
        </tbody>
      </Table>

      <Pagination page={page} pages={pages} total={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
    </div>
  );
}
