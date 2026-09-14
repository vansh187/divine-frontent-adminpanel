import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Avatar } from "../../components/ui/Avatar";
import { PageHeader } from "../../components/ui/PageHeader";
import { Pagination } from "../../components/ui/Pagination";
import { SearchInput } from "../../components/ui/SearchInput";
import { Select } from "../../components/ui/Select";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Table, Td, Th, THead, Tr } from "../../components/ui/Table";
import {
  ApiError,
  listBrokers,
  type ApiBroker,
  type BrokerProject,
  type BrokerSort,
} from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { formatDateTime } from "../../lib/format";

const PAGE_SIZE = 20;

function projectLabel(project: BrokerProject) {
  if (project === "suraksha-enclave") return "Suraksha Enclave";
  return "Ops Divine Greens";
}

export function BrokersListPage() {
  const { accessToken } = useAuth();
  const navigate = useNavigate();

  const [items, setItems] = useState<ApiBroker[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [project, setProject] = useState("ALL");
  const [sort, setSort] = useState<BrokerSort>("-created_at");

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    listBrokers(accessToken, {
      page,
      page_size: PAGE_SIZE,
      search: search || undefined,
      project: project === "ALL" ? undefined : (project as BrokerProject),
      sort,
    })
      .then((res) => {
        if (cancelled) return;
        setItems(res.items);
        setTotalItems(res.pagination.total_items);
        setTotalPages(Math.max(1, res.pagination.total_pages));
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof ApiError ? err.message : "Failed to load channel partners.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, page, search, project, sort]);

  function openBroker(broker: ApiBroker) {
    sessionStorage.setItem(`dvi_broker_${broker.id}`, JSON.stringify(broker));
    navigate(`/admin/brokers/${broker.id}`, { state: { broker } });
  }

  return (
    <div>
      <PageHeader title="Channel Partners" subtitle="Live broker records from the admin API" />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput
          placeholder="Search by name, email or phone"
          className="flex-1 min-w-[220px]"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <Select
          value={project}
          onChange={(e) => {
            setProject(e.target.value);
            setPage(1);
          }}
        >
          <option value="ALL">All projects</option>
          <option value="suraksha-enclave">Suraksha Enclave</option>
          <option value="ops-divine-greens">Ops Divine Greens</option>
        </Select>
        <Select
          value={sort}
          onChange={(e) => {
            setSort(e.target.value as BrokerSort);
            setPage(1);
          }}
        >
          <option value="-created_at">Newest first</option>
          <option value="created_at">Oldest first</option>
          <option value="full_name">Name A-Z</option>
          <option value="-full_name">Name Z-A</option>
        </Select>
      </div>

      {loadError && (
        <div className="mb-4 rounded-xl border border-danger/30 bg-danger-bg p-3 text-sm text-danger">
          {loadError}
        </div>
      )}

      <Table>
        <THead>
          <Th>Channel Partner</Th>
          <Th>Contact</Th>
          <Th>Project</Th>
          <Th>Created</Th>
          <Th>Last Activity</Th>
        </THead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={5} className="px-4 py-10 text-center text-sm text-text-muted">
                Loading channel partners...
              </td>
            </tr>
          ) : (
            <>
              {items.map((b) => (
                <Tr key={b.id} onClick={() => openBroker(b)}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <Avatar name={b.full_name || "Unnamed partner"} />
                      <div>
                        <p className="font-semibold text-text">{b.full_name || "Unnamed partner"}</p>
                        <p className="text-xs text-text-muted">{b.id}</p>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <p className="text-text">{b.email ?? "-"}</p>
                    <p className="text-xs text-text-muted">{b.phone ?? "-"}</p>
                  </Td>
                  <Td>
                    <StatusBadge status={b.project} label={projectLabel(b.project)} />
                  </Td>
                  <Td className="text-text-muted">{formatDateTime(b.created_at)}</Td>
                  <Td className="text-text-muted">{formatDateTime(b.last_activity_at)}</Td>
                </Tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-text-muted">
                    No channel partners match your filters.
                  </td>
                </tr>
              )}
            </>
          )}
        </tbody>
      </Table>

      <Pagination page={page} pages={totalPages} total={totalItems} pageSize={PAGE_SIZE} onPageChange={setPage} />
    </div>
  );
}
