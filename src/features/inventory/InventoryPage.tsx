import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import clsx from "clsx";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { PageHeader } from "../../components/ui/PageHeader";
import { Pagination } from "../../components/ui/Pagination";
import { SearchInput } from "../../components/ui/SearchInput";
import { Select } from "../../components/ui/Select";
import { StatCard } from "../../components/ui/StatCard";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Table, Td, Th, THead, Tr } from "../../components/ui/Table";
import { TextArea } from "../../components/ui/TextArea";
import {
  ApiError,
  changeInventoryStatus,
  getInventoryUnit,
  listInventory,
  listInventoryExport,
  listInventoryProjects,
  type ApiInventoryProject,
  type ApiInventoryStatusChange,
  type ApiInventoryUnit,
  type ApiInventoryUnitDetail,
  type InventoryManualStatus,
  type InventoryStatus,
} from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { formatDateTime } from "../../lib/format";
import { CsvActions } from "../csv/CsvActions";
import { pagedRows } from "../csv/csvModel";
import { inventoryCsv } from "../csv/sections";
import {
  INVENTORY_STATUS_LABELS,
  STATUS_LOCK_MESSAGES,
  changeSourceLabel,
  changedByRoleLabel,
  inventoryStatusLabel,
  inventoryStatusTone,
  plotArea,
  plotSize,
  projectTotals,
} from "./inventoryLabels";

const PAGE_SIZE = 20;
const NOTE_MAX = 255;

function PlotStatusBadge({ status }: { status: string }) {
  return <StatusBadge status={status.toUpperCase()} label={inventoryStatusLabel(status)} tone={inventoryStatusTone(status)} />;
}

function StatusHistory({ history }: { history: ApiInventoryStatusChange[] }) {
  if (history.length === 0) {
    return <p className="text-sm text-text-muted">No status changes recorded yet.</p>;
  }
  return (
    <ol aria-label="Status history" className="space-y-3">
      {history.map((h) => (
        <li key={h.id} className="rounded-xl border border-border p-3">
          <div className="flex flex-wrap items-center gap-2">
            {h.old_status ? <PlotStatusBadge status={h.old_status} /> : <span className="text-xs text-text-muted">New plot</span>}
            <span aria-hidden="true" className="text-text-muted">→</span>
            <span className="sr-only">to</span>
            <PlotStatusBadge status={h.new_status} />
          </div>
          <p className="mt-2 text-sm text-text">
            <span className="font-semibold">{h.changed_by_name}</span>{" "}
            <span className="text-text-muted">({changedByRoleLabel(h.changed_by_role)})</span>
          </p>
          <p className="text-xs text-text-muted">
            <time dateTime={h.changed_at}>{formatDateTime(h.changed_at)}</time> · {changeSourceLabel(h.source)}
          </p>
          {h.note && <p className="mt-1.5 text-xs text-text">“{h.note}”</p>}
        </li>
      ))}
    </ol>
  );
}

function errorMessage(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message || fallback : fallback;
}

export function InventoryPage() {
  const { accessToken } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [projects, setProjects] = useState<ApiInventoryProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  // Bumped after a status change so the counts and the list reload.
  const [refreshKey, setRefreshKey] = useState(0);

  const [items, setItems] = useState<ApiInventoryUnit[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"ALL" | InventoryStatus>("ALL");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ApiInventoryUnitDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [newStatus, setNewStatus] = useState<"" | InventoryManualStatus>("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const requestedProject = searchParams.get("project");
  const current =
    projects.find((p) => p.project_name === requestedProject) ?? (projects.length > 0 ? projects[0] : undefined);
  const project = current?.project_name ?? null;
  const totals = projectTotals(current);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    listInventoryProjects(accessToken)
      .then((res) => {
        if (cancelled) return;
        setProjects(res.items);
        setProjectsError(null);
      })
      .catch((err) => {
        if (!cancelled) setProjectsError(errorMessage(err, "Failed to load projects."));
      })
      .finally(() => {
        if (!cancelled) setProjectsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, refreshKey]);

  useEffect(() => {
    // With no project there is no table to fill (the page shows an empty state).
    if (!accessToken || !project) return;
    let cancelled = false;
    setListLoading(true);
    setListError(null);
    listInventory(accessToken, {
      project_name: project,
      status: status === "ALL" ? undefined : status,
      search: search || undefined,
      page,
      page_size: PAGE_SIZE,
    })
      .then((res) => {
        if (cancelled) return;
        setItems(res.items);
        setTotalItems(res.pagination.total_items);
        setTotalPages(Math.max(1, res.pagination.total_pages));
      })
      .catch((err) => {
        if (!cancelled) setListError(errorMessage(err, "Failed to load plots."));
      })
      .finally(() => {
        if (!cancelled) setListLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, project, status, search, page, refreshKey]);

  const loadDetail = useCallback(
    (id: string) => {
      if (!accessToken) return;
      setDetailLoading(true);
      setDetailError(null);
      getInventoryUnit(accessToken, id)
        .then((res) => {
          setDetail(res);
          setNewStatus("");
        })
        .catch((err) => {
          setDetailError(
            err instanceof ApiError && err.status === 404
              ? "This plot could not be found."
              : errorMessage(err, "Failed to load the plot.")
          );
        })
        .finally(() => setDetailLoading(false));
    },
    [accessToken]
  );

  function selectProject(name: string) {
    setSearchParams({ project: name }, { replace: true });
    setPage(1);
  }

  function openDetail(id: string) {
    setSelectedId(id);
    setDetail(null);
    setNewStatus("");
    setNote("");
    setActionError(null);
    setNotice(null);
    loadDetail(id);
  }

  function closeDetail() {
    if (saving) return;
    setSelectedId(null);
    setDetail(null);
    setDetailError(null);
    setActionError(null);
    setNotice(null);
  }

  async function saveStatus() {
    if (!accessToken || !detail || !newStatus) return;
    setSaving(true);
    setActionError(null);
    setNotice(null);
    try {
      const updated = await changeInventoryStatus(accessToken, detail.id, {
        status: newStatus,
        expected_status: detail.status,
        note: note.trim() || undefined,
      });
      setDetail(updated);
      setNewStatus("");
      setNote("");
      setNotice(`Status changed to ${inventoryStatusLabel(updated.status)}.`);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setActionError("This plot could not be found. It may have been removed.");
        setRefreshKey((k) => k + 1);
      } else if (err instanceof ApiError && err.status === 409) {
        // Changed elsewhere or now locked: show the message and the plot as it is now.
        setActionError(err.message);
        loadDetail(detail.id);
        setRefreshKey((k) => k + 1);
      } else {
        setActionError(errorMessage(err, "Failed to change the status. Please try again."));
      }
    } finally {
      setSaving(false);
    }
  }

  const canChange = !!detail && !detail.status_lock && detail.allowed_statuses.length > 0;

  return (
    <div>
      <PageHeader
        title="Inventory"
        subtitle="Plots in each project and whether they are available or sold"
        actions={
          <CsvActions
            section={inventoryCsv}
            disabled={!project}
            loadRows={pagedRows((token, p, size) =>
              listInventoryExport(token, {
                project_name: project ?? undefined,
                status: status === "ALL" ? undefined : status,
                search: search || undefined,
                page: p,
                page_size: size,
              })
            )}
          />
        }
      />

      {projectsError && (
        <div className="mb-4 rounded-xl border border-danger/30 bg-danger-bg p-3 text-sm text-danger">{projectsError}</div>
      )}

      {projectsLoading ? (
        <p className="py-10 text-center text-sm text-text-muted">Loading projects...</p>
      ) : projects.length === 0 ? (
        !projectsError && <p className="py-10 text-center text-sm text-text-muted">No plots have been added to any project yet.</p>
      ) : (
        <>
          <div className="mb-5 flex gap-2 overflow-x-auto border-b border-border" role="tablist" aria-label="Project">
            {projects.map((p) => (
              <button
                key={p.project_name}
                type="button"
                role="tab"
                aria-selected={p.project_name === project}
                onClick={() => selectProject(p.project_name)}
                className={clsx(
                  "shrink-0 border-b-2 px-4 py-3 text-sm font-semibold whitespace-nowrap",
                  p.project_name === project
                    ? "border-gold text-gold-dark"
                    : "border-transparent text-text-muted hover:text-text"
                )}
              >
                {p.project_name}
                <span className="ml-2 text-xs font-medium text-text-muted">{p.total}</span>
              </button>
            ))}
          </div>

          <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Total plots" value={totals.total} hint={project ?? undefined} />
            <StatCard label="Available" value={totals.available} hint="Free to book" />
            <StatCard label="Sold" value={totals.sold} hint="Sold or booked" />
            <StatCard label="On hold" value={totals.onHold} hint="Held, reserved or in KYC review" />
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-3">
            <SearchInput
              placeholder="Search by plot number or block"
              aria-label="Search plots"
              className="min-w-[220px] flex-1"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            <Select
              aria-label="Status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as "ALL" | InventoryStatus);
                setPage(1);
              }}
            >
              <option value="ALL">All statuses</option>
              {(Object.keys(INVENTORY_STATUS_LABELS) as InventoryStatus[]).map((s) => (
                <option key={s} value={s}>
                  {INVENTORY_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </div>

          {listError && (
            <div className="mb-4 rounded-xl border border-danger/30 bg-danger-bg p-3 text-sm text-danger">{listError}</div>
          )}

          <Table>
            <THead>
              <Th>Plot No</Th>
              <Th>Block</Th>
              <Th>Size</Th>
              <Th>Area</Th>
              <Th>Status</Th>
              <Th>Last status change</Th>
              <Th />
            </THead>
            <tbody>
              {listLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-text-muted">
                    Loading plots...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-text-muted">
                    No plots match your filters.
                  </td>
                </tr>
              ) : (
                items.map((u) => (
                  <Tr key={u.id} onClick={() => openDetail(u.id)}>
                    <Td className="font-semibold">{u.unit_number}</Td>
                    <Td>{u.block || "—"}</Td>
                    <Td>{plotSize(u.width_mtr, u.length_mtr)}</Td>
                    <Td>{plotArea(u.area_sqmt, u.area_sqyd)}</Td>
                    <Td>
                      <PlotStatusBadge status={u.status} />
                    </Td>
                    <Td className="text-text-muted">
                      {u.last_changed_at ? (
                        <>
                          {formatDateTime(u.last_changed_at)}
                          {u.last_changed_by_name && <span className="block text-xs">by {u.last_changed_by_name}</span>}
                        </>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          openDetail(u.id);
                        }}
                      >
                        View
                      </Button>
                    </Td>
                  </Tr>
                ))
              )}
            </tbody>
          </Table>

          <Pagination page={page} pages={totalPages} total={totalItems} pageSize={PAGE_SIZE} onPageChange={setPage} />
        </>
      )}

      <Modal
        open={!!selectedId}
        onClose={closeDetail}
        title={detail ? `Plot ${detail.unit_number}` : "Plot"}
        footer={
          canChange ? (
            <Button onClick={() => void saveStatus()} disabled={saving || !newStatus || note.length > NOTE_MAX}>
              {saving ? "Saving..." : "Save status"}
            </Button>
          ) : undefined
        }
      >
        <div className="space-y-5">
          {actionError && (
            <div role="alert" className="rounded-xl border border-danger/30 bg-danger-bg p-3 text-sm text-danger">
              {actionError}
            </div>
          )}
          {notice && (
            <div role="status" className="rounded-xl border border-success/30 bg-success-bg p-3 text-sm text-success">
              {notice}
            </div>
          )}

          {detailLoading && !detail && <p className="text-sm text-text-muted">Loading plot...</p>}
          {!detailLoading && detailError && <p className="text-sm text-danger">{detailError}</p>}

          {detail && (
            <>
              <dl className="space-y-2">
                {[
                  ["Project", detail.project_name],
                  ["Block", detail.block || "—"],
                  ["Size", plotSize(detail.width_mtr, detail.length_mtr)],
                  ["Area", plotArea(detail.area_sqmt, detail.area_sqyd)],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-4">
                    <dt className="text-text-muted">{label}</dt>
                    <dd className="text-right font-medium text-text">{value}</dd>
                  </div>
                ))}
                <div className="flex justify-between gap-4">
                  <dt className="text-text-muted">Status</dt>
                  <dd>
                    <PlotStatusBadge status={detail.status} />
                  </dd>
                </div>
              </dl>

              <section aria-labelledby="change-status-heading" className="space-y-3">
                <h3 id="change-status-heading" className="text-sm font-semibold text-text">
                  Change status
                </h3>
                {detail.status_lock ? (
                  <p className="rounded-xl bg-warning-bg p-3 text-xs font-medium text-warning">
                    {STATUS_LOCK_MESSAGES[detail.status_lock]}
                  </p>
                ) : (
                  <>
                    <div>
                      <label htmlFor="inventory-new-status" className="mb-1.5 block text-sm font-medium text-text">
                        New status
                      </label>
                      <Select
                        id="inventory-new-status"
                        className="w-full"
                        value={newStatus}
                        disabled={saving}
                        onChange={(e) => setNewStatus(e.target.value as "" | InventoryManualStatus)}
                      >
                        <option value="">Choose a status</option>
                        {detail.allowed_statuses.map((s) => (
                          <option key={s} value={s}>
                            {INVENTORY_STATUS_LABELS[s]}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <TextArea
                      label="Note (optional)"
                      rows={2}
                      maxLength={NOTE_MAX}
                      showCount
                      value={note}
                      disabled={saving}
                      placeholder="For example: sold at the site office"
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </>
                )}
              </section>

              <section aria-labelledby="status-history-heading" className="space-y-3">
                <h3 id="status-history-heading" className="text-sm font-semibold text-text">
                  Status history
                </h3>
                <StatusHistory history={detail.history} />
              </section>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
