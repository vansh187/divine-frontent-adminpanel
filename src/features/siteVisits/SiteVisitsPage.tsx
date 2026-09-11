import { useMemo, useState } from "react";
import { PageHeader } from "../../components/ui/PageHeader";
import { Pagination } from "../../components/ui/Pagination";
import { SearchInput } from "../../components/ui/SearchInput";
import { Select } from "../../components/ui/Select";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Table, Td, Th, THead, Tr } from "../../components/ui/Table";
import { siteVisits } from "../../lib/mockData";

const PAGE_SIZE = 6;

export function SiteVisitsPage() {
  const [search, setSearch] = useState("");
  const [source, setSource] = useState<"ALL" | "CUSTOMER" | "BROKER_CHANNEL">("ALL");
  const [status, setStatus] = useState("ALL");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    return siteVisits.filter((v) => {
      const matchesSearch =
        v.customerName.toLowerCase().includes(search.toLowerCase()) ||
        v.project.toLowerCase().includes(search.toLowerCase());
      const matchesSource = source === "ALL" || v.source === source;
      const matchesStatus = status === "ALL" || v.status === status;
      return matchesSearch && matchesSource && matchesStatus;
    });
  }, [search, source, status]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <PageHeader title="Site Visits" subtitle="Unified customer and broker-channel site visits" />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput
          placeholder="Search by customer or project"
          className="flex-1 min-w-[220px]"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <div className="flex overflow-hidden rounded-xl border border-border">
          {(["ALL", "CUSTOMER", "BROKER_CHANNEL"] as const).map((s) => (
            <button
              key={s}
              onClick={() => {
                setSource(s);
                setPage(1);
              }}
              className={`px-3.5 py-2.5 text-xs font-semibold transition-colors ${
                source === s ? "bg-ink text-white" : "bg-surface text-text-muted hover:bg-surface-muted"
              }`}
            >
              {s === "ALL" ? "All" : s === "CUSTOMER" ? "Customer" : "Broker Channel"}
            </button>
          ))}
        </div>
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="ALL">All statuses</option>
          <option value="SCHEDULED">Scheduled</option>
          <option value="CONFIRMED">Confirmed</option>
          <option value="COMPLETED">Completed</option>
          <option value="NO_SHOW">No Show</option>
          <option value="FOLLOW_UP_REQUIRED">Follow-up Required</option>
          <option value="CONVERTED">Converted</option>
          <option value="CANCELLED">Cancelled</option>
        </Select>
      </div>

      <Table>
        <THead>
          <Th>Visit ID</Th>
          <Th>Customer</Th>
          <Th>Project / Plot</Th>
          <Th>Source</Th>
          <Th>Scheduled</Th>
          <Th>Assigned To</Th>
          <Th>Status</Th>
        </THead>
        <tbody>
          {pageItems.map((v) => (
            <Tr key={v.id}>
              <Td className="font-medium text-text-muted">{v.id}</Td>
              <Td className="font-medium">{v.customerName}</Td>
              <Td>
                {v.project} · {v.plot}
              </Td>
              <Td>
                <StatusBadge status={v.source} label={v.source === "CUSTOMER" ? "Direct" : v.brokerName} />
              </Td>
              <Td className="text-text-muted">{v.scheduledAt}</Td>
              <Td>{v.assignedTo}</Td>
              <Td>
                <StatusBadge status={v.status} />
              </Td>
            </Tr>
          ))}
          {pageItems.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-10 text-center text-sm text-text-muted">
                No site visits match your filters.
              </td>
            </tr>
          )}
        </tbody>
      </Table>

      <Pagination page={page} pages={pages} total={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
    </div>
  );
}
