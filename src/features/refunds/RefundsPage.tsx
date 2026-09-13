import { useMemo, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { PageHeader } from "../../components/ui/PageHeader";
import { Pagination } from "../../components/ui/Pagination";
import { SearchInput } from "../../components/ui/SearchInput";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Table, Td, Th, THead, Tr } from "../../components/ui/Table";
import { formatCurrency } from "../../lib/format";
import { refunds } from "../../lib/mockData";
import type { Refund } from "../../lib/types";

const PAGE_SIZE = 6;

export function RefundsPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Refund | null>(null);

  const filtered = useMemo(
    () =>
      refunds.filter(
        (r) =>
          r.customerName.toLowerCase().includes(search.toLowerCase()) ||
          r.bookingId.toLowerCase().includes(search.toLowerCase())
      ),
    [search]
  );

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <PageHeader title="Refunds" subtitle="Cancellation and refund workflow tracking" />

      <div className="mb-4">
        <SearchInput
          placeholder="Search by customer or booking ID"
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
          <Th>Refund ID</Th>
          <Th>Booking</Th>
          <Th>Customer</Th>
          <Th>Amount</Th>
          <Th>Method</Th>
          <Th>Status</Th>
          <Th />
        </THead>
        <tbody>
          {pageItems.map((r) => (
            <Tr key={r.id}>
              <Td className="font-medium text-text-muted">{r.id}</Td>
              <Td>{r.bookingId}</Td>
              <Td className="font-medium">{r.customerName}</Td>
              <Td className="font-semibold">{formatCurrency(r.amount)}</Td>
              <Td>{r.method}</Td>
              <Td>
                <StatusBadge status={r.status} />
              </Td>
              <Td>
                <Button variant="outline" size="sm" onClick={() => setSelected(r)}>
                  View
                </Button>
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>

      <Pagination page={page} pages={pages} total={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} />

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.id ?? ""}
        footer={
          selected?.status === "CASH_REFUND_PENDING" ? (
            <Button onClick={() => setSelected(null)}>Mark Cash Collected</Button>
          ) : undefined
        }
      >
        {selected && (
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-text-muted">Booking</span>
              <span className="font-medium text-text">{selected.bookingId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Customer</span>
              <span className="font-medium text-text">{selected.customerName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Amount</span>
              <span className="font-medium text-text">{formatCurrency(selected.amount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Reason</span>
              <span className="font-medium text-text">{selected.reason}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Status</span>
              <StatusBadge status={selected.status} />
            </div>
            {selected.status === "CASH_REFUND_PENDING" && (
              <p className="rounded-xl bg-warning-bg p-3 text-xs font-medium text-warning">
                Please collect the refundable cash amount from the office after 3–5 working days,
                subject to finance confirmation.
              </p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
