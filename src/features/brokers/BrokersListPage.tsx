import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Avatar } from "../../components/ui/Avatar";
import { PageHeader } from "../../components/ui/PageHeader";
import { Pagination } from "../../components/ui/Pagination";
import { SearchInput } from "../../components/ui/SearchInput";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Table, Td, Th, THead, Tr } from "../../components/ui/Table";
import { formatCompactCurrency } from "../../lib/format";
import { brokers } from "../../lib/mockData";

const PAGE_SIZE = 6;

export function BrokersListPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(
    () =>
      brokers.filter(
        (b) =>
          b.name.toLowerCase().includes(search.toLowerCase()) ||
          b.agency.toLowerCase().includes(search.toLowerCase())
      ),
    [search]
  );

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <PageHeader title="Brokers / Channel Partners" subtitle="Performance and broker-sourced activity" />

      <div className="mb-4">
        <SearchInput
          placeholder="Search by broker or agency name"
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
          <Th>Broker</Th>
          <Th>Contact</Th>
          <Th>Leads</Th>
          <Th>Site Visits</Th>
          <Th>Conversions</Th>
          <Th>Commission Earned</Th>
          <Th>Status</Th>
        </THead>
        <tbody>
          {pageItems.map((b) => (
            <Tr key={b.id} onClick={() => navigate(`/admin/brokers/${b.id}`)}>
              <Td>
                <div className="flex items-center gap-3">
                  <Avatar name={b.name} />
                  <div>
                    <p className="font-semibold text-text">{b.name}</p>
                    <p className="text-xs text-text-muted">{b.agency}</p>
                  </div>
                </div>
              </Td>
              <Td>
                <p className="text-text">{b.email}</p>
                <p className="text-xs text-text-muted">{b.phone}</p>
              </Td>
              <Td>{b.leadsSourced}</Td>
              <Td>{b.siteVisitsSourced}</Td>
              <Td>{b.bookingsConverted}</Td>
              <Td className="font-semibold text-text">{formatCompactCurrency(b.commissionEarned)}</Td>
              <Td>
                <StatusBadge status={b.status} />
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>

      <Pagination page={page} pages={pages} total={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
    </div>
  );
}
