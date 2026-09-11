import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "../../components/ui/PageHeader";
import { Pagination } from "../../components/ui/Pagination";
import { SearchInput } from "../../components/ui/SearchInput";
import { Select } from "../../components/ui/Select";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Table, Td, Th, THead, Tr } from "../../components/ui/Table";
import { formatCurrency } from "../../lib/format";
import { bookings } from "../../lib/mockData";

const PAGE_SIZE = 8;

export function BookingsQueuePage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    return bookings.filter((b) => {
      const matchesSearch =
        b.customerName.toLowerCase().includes(search.toLowerCase()) ||
        b.id.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = status === "ALL" || b.status === status;
      return matchesSearch && matchesStatus;
    });
  }, [search, status]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <PageHeader title="Booking Queue" subtitle="KYC and payment review workspace" />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput
          placeholder="Search by booking ID or customer"
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
          <option value="PAYMENT_RECEIVED">Payment Received</option>
          <option value="KYC_PENDING">KYC Pending</option>
          <option value="UNDER_REVIEW">Under Review</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="CANCELLED">Cancelled</option>
        </Select>
      </div>

      <Table>
        <THead>
          <Th>Booking ID</Th>
          <Th>Customer</Th>
          <Th>Project / Plot</Th>
          <Th>Amount</Th>
          <Th>KYC Status</Th>
          <Th>Plot Status</Th>
          <Th>Booking Status</Th>
        </THead>
        <tbody>
          {pageItems.map((b) => (
            <Tr key={b.id} onClick={() => navigate(`/admin/bookings/${b.id}`)}>
              <Td className="font-medium text-text-muted">{b.id}</Td>
              <Td className="font-medium">{b.customerName}</Td>
              <Td>
                {b.project} · {b.plot}
              </Td>
              <Td className="font-semibold">{formatCurrency(b.amount)}</Td>
              <Td>
                <StatusBadge status={b.kycStatus} />
              </Td>
              <Td>
                <StatusBadge status={b.plotStatus} />
              </Td>
              <Td>
                <StatusBadge status={b.status} />
              </Td>
            </Tr>
          ))}
          {pageItems.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-10 text-center text-sm text-text-muted">
                No bookings match your filters.
              </td>
            </tr>
          )}
        </tbody>
      </Table>

      <Pagination page={page} pages={pages} total={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
    </div>
  );
}
