import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Avatar } from "../../components/ui/Avatar";
import { PageHeader } from "../../components/ui/PageHeader";
import { Pagination } from "../../components/ui/Pagination";
import { SearchInput } from "../../components/ui/SearchInput";
import { Select } from "../../components/ui/Select";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Table, Td, Th, THead, Tr } from "../../components/ui/Table";
import { customers } from "../../lib/mockData";

const PAGE_SIZE = 6;

export function CustomersListPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("ALL");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    return customers.filter((c) => {
      const matchesSearch =
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.email.toLowerCase().includes(search.toLowerCase()) ||
        c.phone.includes(search);
      const matchesSource = source === "ALL" || c.source === source;
      return matchesSearch && matchesSource;
    });
  }, [search, source]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <PageHeader title="Customers &amp; Leads" subtitle="All customer and broker-sourced leads" />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput
          placeholder="Search by name, email or phone"
          className="flex-1 min-w-[220px]"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <Select
          value={source}
          onChange={(e) => {
            setSource(e.target.value);
            setPage(1);
          }}
        >
          <option value="ALL">All sources</option>
          <option value="CUSTOMER">Customer</option>
          <option value="BROKER_CHANNEL">Broker Channel</option>
        </Select>
      </div>

      <Table>
        <THead>
          <Th>Customer</Th>
          <Th>Contact</Th>
          <Th>Project</Th>
          <Th>Source</Th>
          <Th>Status</Th>
          <Th>Site Visits</Th>
          <Th>Last Activity</Th>
        </THead>
        <tbody>
          {pageItems.map((c) => (
            <Tr key={c.id} onClick={() => navigate(`/admin/customers/${c.id}`)}>
              <Td>
                <div className="flex items-center gap-3">
                  <Avatar name={c.name} />
                  <div>
                    <p className="font-semibold text-text">{c.name}</p>
                    <p className="text-xs text-text-muted">{c.id}</p>
                  </div>
                </div>
              </Td>
              <Td>
                <p className="text-text">{c.email}</p>
                <p className="text-xs text-text-muted">{c.phone}</p>
              </Td>
              <Td>{c.project}</Td>
              <Td>
                <StatusBadge status={c.source} label={c.source === "CUSTOMER" ? "Direct" : "Broker Channel"} />
              </Td>
              <Td>
                <StatusBadge status={c.status} />
              </Td>
              <Td>{c.siteVisits}</Td>
              <Td className="text-text-muted">{c.lastActivity}</Td>
            </Tr>
          ))}
          {pageItems.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-10 text-center text-sm text-text-muted">
                No customers match your filters.
              </td>
            </tr>
          )}
        </tbody>
      </Table>

      <Pagination page={page} pages={pages} total={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
    </div>
  );
}
