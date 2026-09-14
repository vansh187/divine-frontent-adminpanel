import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "../../components/ui/PageHeader";
import { Pagination } from "../../components/ui/Pagination";
import { SearchInput } from "../../components/ui/SearchInput";
import { Select } from "../../components/ui/Select";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Table, Td, Th, THead, Tr } from "../../components/ui/Table";
import { ApiError, listVisits, type ApiVisit, type BrokerProject, type VisitOriginType } from "../../lib/api";
import { useAuth } from "../../lib/auth";

const PAGE_SIZE = 20;

type DisplayStatus = "scheduled" | "completed" | "cancelled";

function projectLabel(project: BrokerProject | null) {
  if (project === "suraksha-enclave") return "Suraksha Enclave";
  if (project === "ops-divine-greens") return "Ops Divine Greens";
  return "—";
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(date);
}

function deriveStatus(v: ApiVisit): DisplayStatus {
  if (v.status === "cancelled") return "cancelled";
  const date = v.visit_date ? new Date(v.visit_date) : null;
  if (date && !Number.isNaN(date.getTime())) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (date < today) return "completed";
  }
  return "scheduled";
}

function scheduleLabel(v: ApiVisit) {
  if (v.status === "requested" || !v.visit_time || !v.visit_date) {
    return v.preferred_window ? `Requested · ${v.preferred_window}` : "Awaiting confirmation";
  }
  return `${formatDate(v.visit_date)} · ${v.visit_time}`;
}

export function SiteVisitsPage() {
  const { accessToken } = useAuth();
  const navigate = useNavigate();

  const [items, setItems] = useState<ApiVisit[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [originType, setOriginType] = useState<"ALL" | VisitOriginType>("ALL");
  const [status, setStatus] = useState<"ALL" | DisplayStatus>("ALL");

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

    listVisits(accessToken, {
      page,
      page_size: PAGE_SIZE,
      search: search || undefined,
      origin_type: originType === "ALL" ? undefined : originType,
    })
      .then((res) => {
        if (cancelled) return;
        setItems(res.items);
        setTotalItems(res.pagination.total_items);
        setTotalPages(Math.max(1, res.pagination.total_pages));
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof ApiError ? err.message : "Failed to load site visits.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, page, search, originType]);

  const visibleItems = status === "ALL" ? items : items.filter((v) => deriveStatus(v) === status);

  function openVisit(visit: ApiVisit) {
    sessionStorage.setItem(`dvi_visit_${visit.id}`, JSON.stringify(visit));
    navigate(`/admin/site-visits/${visit.id}`, { state: { visit } });
  }

  return (
    <div>
      <PageHeader title="Site Visits" subtitle="Unified customer and channel partner site visits" />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput
          placeholder="Search by customer or project"
          className="flex-1 min-w-[220px]"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <div className="flex overflow-hidden rounded-xl border border-border">
          {(["ALL", "CUSTOMER", "CHANNEL_PARTNER"] as const).map((s) => (
            <button
              key={s}
              onClick={() => {
                setOriginType(s);
                setPage(1);
              }}
              className={`px-3.5 py-2.5 text-xs font-semibold transition-colors ${
                originType === s ? "bg-ink text-white" : "bg-surface text-text-muted hover:bg-surface-muted"
              }`}
            >
              {s === "ALL" ? "All" : s === "CUSTOMER" ? "Customer" : "Channel Partner"}
            </button>
          ))}
        </div>
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as "ALL" | DisplayStatus);
            setPage(1);
          }}
        >
          <option value="ALL">All statuses</option>
          <option value="scheduled">Scheduled</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </Select>
      </div>

      {loadError && (
        <div className="mb-4 rounded-xl border border-danger/30 bg-danger-bg p-3 text-sm text-danger">
          {loadError}
        </div>
      )}

      <Table>
        <THead>
          <Th>Customer</Th>
          <Th>Project</Th>
          <Th>Source</Th>
          <Th>Scheduled</Th>
          <Th>Status</Th>
        </THead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={5} className="px-4 py-10 text-center text-sm text-text-muted">
                Loading site visits...
              </td>
            </tr>
          ) : (
            <>
              {visibleItems.map((v) => (
                <Tr key={v.id} onClick={() => openVisit(v)}>
                  <Td>
                    <p className="font-semibold text-text">{v.customer_name}</p>
                    <p className="text-xs text-text-muted">{v.customer_contact ?? v.customer_email ?? "—"}</p>
                  </Td>
                  <Td>{projectLabel(v.project_name)}</Td>
                  <Td>
                    <StatusBadge
                      status={v.origin_type}
                      label={v.origin_type === "CUSTOMER" ? "Website" : v.source ?? "Channel Partner"}
                    />
                  </Td>
                  <Td className="text-text-muted">{scheduleLabel(v)}</Td>
                  <Td>
                    <StatusBadge status={deriveStatus(v).toUpperCase()} />
                  </Td>
                </Tr>
              ))}
              {visibleItems.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-text-muted">
                    No site visits match your filters.
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
