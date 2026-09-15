import { useCallback, useEffect, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { PageHeader } from "../../components/ui/PageHeader";
import { Pagination } from "../../components/ui/Pagination";
import { SearchInput } from "../../components/ui/SearchInput";
import { Select } from "../../components/ui/Select";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Table, Td, Th, THead, Tr } from "../../components/ui/Table";
import {
  ApiError,
  getRefund,
  listRefunds,
  markRefundCollected,
  retryRefund,
  type ApiRefundDetail,
  type ApiRefundListItem,
  type RefundMethod,
  type RefundStatus,
} from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { formatCurrency, formatDateTime } from "../../lib/format";

const PAGE_SIZE = 20;

const METHOD_LABELS: Record<RefundMethod, string> = {
  razorpay: "Razorpay",
  cash: "Cash",
  rtgs_neft: "RTGS/NEFT",
};

const STATUS_LABELS: Record<RefundStatus, string> = {
  processing: "Processing",
  completed: "Completed",
  failed: "Failed",
  cash_refund_pending: "Cash Refund Pending",
  cash_collected: "Cash Collected",
  bank_transfer_pending: "Bank Transfer Pending",
  bank_transfer_completed: "Bank Transfer Completed",
};

function detailErrorMessage(err: unknown) {
  if (err instanceof ApiError) {
    if (err.status === 404) return "This refund could not be found.";
    return err.message;
  }
  return "Failed to load refund details.";
}

export function RefundsPage() {
  const { accessToken } = useAuth();

  const [items, setItems] = useState<ApiRefundListItem[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"ALL" | RefundStatus>("ALL");
  const [method, setMethod] = useState<"ALL" | RefundMethod>("ALL");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ApiRefundDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [collectNote, setCollectNote] = useState("");
  const [markCollectedOpen, setMarkCollectedOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const loadList = useCallback(() => {
    if (!accessToken) return;
    let cancelled = false;
    setListLoading(true);
    setListError(null);

    listRefunds(accessToken, {
      page,
      page_size: PAGE_SIZE,
      search: search || undefined,
      status: status === "ALL" ? undefined : status,
      method: method === "ALL" ? undefined : method,
    })
      .then((res) => {
        if (cancelled) return;
        setItems(res.items);
        setTotalItems(res.pagination.total_items);
        setTotalPages(Math.max(1, res.pagination.total_pages));
      })
      .catch((err) => {
        if (cancelled) return;
        setListError(err instanceof ApiError ? err.message : "Failed to load refunds.");
      })
      .finally(() => {
        if (!cancelled) setListLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, page, search, status, method]);

  useEffect(() => {
    const cleanup = loadList();
    return cleanup;
  }, [loadList]);

  function openDetail(id: string) {
    setSelectedId(id);
    setDetail(null);
    setDetailError(null);
    setActionError(null);
    setCollectNote("");
    setMarkCollectedOpen(false);
  }

  function closeDetail() {
    if (actionPending) return;
    setSelectedId(null);
    setDetail(null);
    setDetailError(null);
    setActionError(null);
  }

  useEffect(() => {
    if (!selectedId || !accessToken) return;
    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);

    getRefund(accessToken, selectedId)
      .then((res) => {
        if (cancelled) return;
        setDetail(res);
      })
      .catch((err) => {
        if (cancelled) return;
        setDetailError(detailErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, selectedId]);

  function handleActionError(err: unknown, fallback: string) {
    if (err instanceof ApiError && err.status === 404) {
      setActionError("This refund could not be found. It may have been removed.");
      closeDetail();
      loadList();
      return;
    }
    if (err instanceof ApiError && err.status === 409) {
      setActionError(`${err.message || "This refund was already updated elsewhere"} — showing the latest state.`);
      setMarkCollectedOpen(false);
      if (accessToken && detail) {
        getRefund(accessToken, detail.id)
          .then(setDetail)
          .catch(() => {});
      }
      loadList();
      return;
    }
    setActionError(err instanceof ApiError ? err.message || fallback : fallback);
  }

  async function handleRetry() {
    if (!accessToken || !detail) return;
    setActionPending(true);
    setActionError(null);
    try {
      const result = await retryRefund(accessToken, detail.id);
      setDetail(result);
      loadList();
    } catch (err) {
      handleActionError(err, "Failed to retry the refund. Please try again.");
    } finally {
      setActionPending(false);
    }
  }

  async function handleMarkCollected() {
    if (!accessToken || !detail) return;
    setActionPending(true);
    setActionError(null);
    try {
      const result = await markRefundCollected(accessToken, detail.id, collectNote.trim() || undefined);
      setDetail(result);
      setMarkCollectedOpen(false);
      setCollectNote("");
      loadList();
    } catch (err) {
      handleActionError(err, "Failed to mark the refund collected. Please try again.");
    } finally {
      setActionPending(false);
    }
  }

  const canRetry = detail?.method === "razorpay" && detail?.status === "processing";
  const canMarkCollected =
    detail &&
    (["cash", "rtgs_neft"] as RefundMethod[]).includes(detail.method) &&
    (["cash_refund_pending", "bank_transfer_pending"] as RefundStatus[]).includes(detail.status);

  return (
    <div>
      <PageHeader title="Refunds" subtitle="Cancellation and refund workflow tracking" />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput
          placeholder="Search by payment id, booking, project, unit or customer"
          className="flex-1 min-w-[220px]"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as "ALL" | RefundStatus);
            setPage(1);
          }}
        >
          <option value="ALL">All statuses</option>
          {(Object.keys(STATUS_LABELS) as RefundStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
        <Select
          value={method}
          onChange={(e) => {
            setMethod(e.target.value as "ALL" | RefundMethod);
            setPage(1);
          }}
        >
          <option value="ALL">All methods</option>
          {(Object.keys(METHOD_LABELS) as RefundMethod[]).map((m) => (
            <option key={m} value={m}>
              {METHOD_LABELS[m]}
            </option>
          ))}
        </Select>
      </div>

      {listError && (
        <div className="mb-4 rounded-xl border border-danger/30 bg-danger-bg p-3 text-sm text-danger">
          {listError}
        </div>
      )}

      <Table>
        <THead>
          <Th>Payment ID</Th>
          <Th>Booking</Th>
          <Th>Customer</Th>
          <Th>Project / Unit</Th>
          <Th>Amount</Th>
          <Th>Method</Th>
          <Th>Status</Th>
          <Th>Initiated</Th>
          <Th />
        </THead>
        <tbody>
          {listLoading ? (
            <tr>
              <td colSpan={9} className="px-4 py-10 text-center text-sm text-text-muted">
                Loading refunds...
              </td>
            </tr>
          ) : (
            <>
              {items.map((r) => (
                <Tr key={r.id} onClick={() => openDetail(r.id)}>
                  <Td className="font-medium text-text-muted">{r.id.slice(0, 8).toUpperCase()}</Td>
                  <Td>{r.booking_id ?? "—"}</Td>
                  <Td className="font-medium">{r.customer_name ?? r.customer_id}</Td>
                  <Td>
                    {r.project_name ?? "—"} {r.unit_number ? `· ${r.unit_number}` : ""}
                  </Td>
                  <Td className="font-semibold">{formatCurrency(r.amount)}</Td>
                  <Td>{METHOD_LABELS[r.method]}</Td>
                  <Td>
                    <StatusBadge status={r.status.toUpperCase()} label={STATUS_LABELS[r.status]} />
                  </Td>
                  <Td className="text-text-muted">{formatDateTime(r.refund_initiated_date)}</Td>
                  <Td>
                    <Button variant="outline" size="sm" onClick={() => openDetail(r.id)}>
                      View
                    </Button>
                  </Td>
                </Tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-sm text-text-muted">
                    No refunds match your filters.
                  </td>
                </tr>
              )}
            </>
          )}
        </tbody>
      </Table>

      <Pagination page={page} pages={totalPages} total={totalItems} pageSize={PAGE_SIZE} onPageChange={setPage} />

      <Modal
        open={!!selectedId}
        onClose={closeDetail}
        title={detail?.id ? `Refund ${detail.id.slice(0, 8).toUpperCase()}` : "Refund"}
        footer={
          detail ? (
            <>
              {canRetry && (
                <Button variant="outline" onClick={handleRetry} disabled={actionPending}>
                  {actionPending ? "Retrying..." : "Retry Refund"}
                </Button>
              )}
              {canMarkCollected && (
                <Button onClick={() => setMarkCollectedOpen(true)} disabled={actionPending}>
                  Mark Collected
                </Button>
              )}
            </>
          ) : undefined
        }
      >
        <div className="space-y-3">
          {actionError && (
            <div className="rounded-xl border border-danger/30 bg-danger-bg p-3 text-sm text-danger">
              {actionError}
            </div>
          )}

          {detailLoading && <p className="text-sm text-text-muted">Loading refund details...</p>}

          {!detailLoading && detailError && <p className="text-sm text-danger">{detailError}</p>}

          {!detailLoading && !detailError && detail && (
            <>
              <div className="flex justify-between">
                <span className="text-text-muted">Booking</span>
                <span className="font-medium text-text">{detail.booking_id ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Customer</span>
                <span className="font-medium text-text">{detail.customer_name ?? detail.customer_id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Project / Unit</span>
                <span className="font-medium text-text">
                  {detail.project_name ?? "—"} {detail.unit_number ? `· ${detail.unit_number}` : ""}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Amount</span>
                <span className="font-medium text-text">{formatCurrency(detail.amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Method</span>
                <span className="font-medium text-text">{METHOD_LABELS[detail.method]}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Status</span>
                <StatusBadge status={detail.status.toUpperCase()} label={STATUS_LABELS[detail.status]} />
              </div>
              {detail.method === "razorpay" && (
                <>
                  <div className="flex justify-between">
                    <span className="text-text-muted">Razorpay Payment ID</span>
                    <span className="font-medium text-text">{detail.razorpay_payment_id ?? "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">Razorpay Refund ID</span>
                    <span className="font-medium text-text">{detail.razorpay_refund_id ?? "—"}</span>
                  </div>
                </>
              )}
              {detail.method === "rtgs_neft" && (
                <div className="flex justify-between">
                  <span className="text-text-muted">UTR Number</span>
                  <span className="font-medium text-text">{detail.utr_number ?? "—"}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-text-muted">Initiated</span>
                <span className="font-medium text-text">{formatDateTime(detail.refund_initiated_date)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Completed</span>
                <span className="font-medium text-text">{formatDateTime(detail.refund_completed_date)}</span>
              </div>
              {detail.refund_note && (
                <p className="rounded-xl bg-warning-bg p-3 text-xs font-medium text-warning">
                  {detail.refund_note}
                </p>
              )}
            </>
          )}
        </div>
      </Modal>

      <Modal
        open={markCollectedOpen}
        onClose={() => {
          if (actionPending) return;
          setMarkCollectedOpen(false);
        }}
        title="Mark refund collected"
        footer={
          <>
            <Button variant="outline" onClick={() => setMarkCollectedOpen(false)} disabled={actionPending}>
              Back
            </Button>
            <Button onClick={handleMarkCollected} disabled={actionPending}>
              {actionPending ? "Saving..." : "Confirm Collected"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p>Confirm the customer has actually received this manual refund. This cannot be undone.</p>
          <textarea
            rows={3}
            className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-text focus:border-gold focus:outline-none"
            placeholder="Note for the record (optional)"
            value={collectNote}
            onChange={(e) => setCollectNote(e.target.value)}
          />
        </div>
      </Modal>
    </div>
  );
}
