import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "../../components/ui/PageHeader";
import { Pagination } from "../../components/ui/Pagination";
import { SearchInput } from "../../components/ui/SearchInput";
import { Select } from "../../components/ui/Select";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Table, Td, Th, THead, Tr } from "../../components/ui/Table";
import {
  ApiError,
  listBookings,
  type ApiBookingListItem,
  type BookingStatus,
  type KycStatus,
} from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { formatCurrency } from "../../lib/format";

const PAGE_SIZE = 20;

export function BookingsQueuePage() {
  const { accessToken } = useAuth();
  const navigate = useNavigate();

  const [items, setItems] = useState<ApiBookingListItem[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"ALL" | BookingStatus>("ALL");
  const [kycStatus, setKycStatus] = useState<"ALL" | KycStatus>("ALL");

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

    listBookings(accessToken, {
      page,
      page_size: PAGE_SIZE,
      search: search || undefined,
      status: status === "ALL" ? undefined : status,
      kyc_status: kycStatus === "ALL" ? undefined : kycStatus,
    })
      .then((res) => {
        if (cancelled) return;
        setItems(res.items ?? []);
        setTotalItems(res.pagination?.total_items ?? 0);
        setTotalPages(Math.max(1, res.pagination?.total_pages ?? 1));
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof ApiError ? err.message : "Failed to load the booking queue.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, page, search, status, kycStatus]);

  return (
    <div>
      <PageHeader title="Booking Queue" subtitle="KYC and payment review workspace" />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput
          placeholder="Search by booking ID, customer or project"
          className="flex-1 min-w-[220px]"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as "ALL" | BookingStatus);
            setPage(1);
          }}
        >
          <option value="ALL">All statuses</option>
          <option value="pending_kyc_review">Pending KYC Review</option>
          <option value="booked">Booked</option>
          <option value="rejected">Rejected</option>
          <option value="cancelled">Cancelled</option>
        </Select>
        <Select
          value={kycStatus}
          onChange={(e) => {
            setKycStatus(e.target.value as "ALL" | KycStatus);
            setPage(1);
          }}
        >
          <option value="ALL">All KYC statuses</option>
          <option value="pending">Pending</option>
          <option value="verified">Verified</option>
          <option value="needs_resubmission">Needs Resubmission</option>
          <option value="rejected">Rejected</option>
        </Select>
      </div>

      {loadError && (
        <div className="mb-4 rounded-xl border border-danger/30 bg-danger-bg p-3 text-sm text-danger">
          {loadError}
        </div>
      )}

      <Table>
        <THead>
          <Th>Booking ID</Th>
          <Th>Customer</Th>
          <Th>Project / Unit</Th>
          <Th>Amount</Th>
          <Th>KYC Status</Th>
          <Th>Booking Status</Th>
        </THead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={6} className="px-4 py-10 text-center text-sm text-text-muted">
                Loading bookings...
              </td>
            </tr>
          ) : (
            <>
              {items.map((b) => (
                <Tr key={b.id} onClick={() => navigate(`/admin/bookings/${b.id}`)}>
                  <Td className="font-medium text-text-muted">{b.id}</Td>
                  <Td className="font-medium">{b.customer_name}</Td>
                  <Td>
                    {b.project_name} · {b.unit_number}
                  </Td>
                  <Td className="font-semibold">{formatCurrency(b.amount)}</Td>
                  <Td>
                    <StatusBadge status={b.kyc_status.toUpperCase()} />
                  </Td>
                  <Td>
                    <StatusBadge status={b.status.toUpperCase()} />
                  </Td>
                </Tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-text-muted">
                    No bookings match your filters.
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
