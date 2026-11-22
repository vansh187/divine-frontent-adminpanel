import { useEffect, useMemo, useState } from "react";
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
import { bookingApplicant } from "../../lib/applicants";
import { useAuth } from "../../lib/auth";
import { formatCurrency, formatDate } from "../../lib/format";
import { CsvActions } from "../csv/CsvActions";
import { pagedRows } from "../csv/csvModel";
import { bookingsCsv } from "../csv/sections";
import { nextPaymentDue, receivedAmount } from "./bookingMoney";
import { dueInText } from "./PaymentPlanCard";

const PAGE_SIZE = 20;
const COLUMNS = 9;

/** What the customer pays next and when, or that nothing is left. */
function NextPayment({ booking }: { booking: ApiBookingListItem }) {
  const next = booking.next_payment;
  if (!next) return <span className="text-text-muted">{booking.outstanding === 0 ? "Fully paid" : "—"}</span>;
  return (
    <div className="space-y-1">
      <p className="font-semibold text-text">{formatCurrency(next.amount)}</p>
      <p className="text-xs text-text-muted">
        {next.due_date ? formatDate(next.due_date) : nextPaymentDue(booking)}
        {next.due_date && dueInText(next.days_until_due) ? ` · ${dueInText(next.days_until_due)}` : ""}
      </p>
      <StatusBadge status={next.status.toUpperCase()} />
    </div>
  );
}

const money = (value: number | null | undefined) => (value == null ? "—" : formatCurrency(value));

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
  // Shared by the list and the CSV export, so an export holds exactly what the filters show.
  const filters = useMemo(
    () => ({
      search: search || undefined,
      status: status === "ALL" ? undefined : status,
      kyc_status: kycStatus === "ALL" ? undefined : kycStatus,
    }),
    [search, status, kycStatus]
  );

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

    listBookings(accessToken, { ...filters, page, page_size: PAGE_SIZE })
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
  }, [accessToken, page, filters]);

  return (
    <div>
      <PageHeader
        title="Booking Queue"
        subtitle="KYC and payment review workspace"
        actions={
          <CsvActions
            section={bookingsCsv}
            loadRows={pagedRows((token, p, size) => listBookings(token, { ...filters, page: p, page_size: size }))}
          />
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput
          placeholder="Search by booking ID, customer ID or project"
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
          <Th>Plot Price</Th>
          <Th>Received</Th>
          <Th>Outstanding</Th>
          <Th>Next Payment</Th>
          <Th>KYC Status</Th>
          <Th>Booking Status</Th>
        </THead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={COLUMNS} className="px-4 py-10 text-center text-sm text-text-muted">
                Loading bookings...
              </td>
            </tr>
          ) : (
            <>
              {items.map((b) => (
                <Tr key={b.id} onClick={() => navigate(`/admin/bookings/${b.id}`)}>
                  <Td className="font-medium text-text-muted">{b.id}</Td>
                  <Td className="font-medium">
                    {bookingApplicant(b)}
                    {b.is_offline && <span className="block text-xs font-normal text-text-muted">Offline buyer</span>}
                  </Td>
                  <Td>
                    {b.project_name} · {b.unit_number}
                  </Td>
                  <Td>{money(b.total)}</Td>
                  <Td className="font-semibold">{money(receivedAmount(b))}</Td>
                  <Td>{money(b.outstanding)}</Td>
                  <Td>
                    <NextPayment booking={b} />
                  </Td>
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
                  <td colSpan={COLUMNS} className="px-4 py-10 text-center text-sm text-text-muted">
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
