import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { SectionErrorBoundary } from "../../components/SectionErrorBoundary";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { StatusBadge } from "../../components/ui/StatusBadge";
import {
  ApiError,
  getBooking,
  listBookings,
  type ApiBookingDetail,
  type ApiBookingListItem,
  type BookingStatus,
} from "../../lib/api";
import { fetchPages } from "../../lib/pagination";
import { PaymentPlanCard, PlanCardHeader } from "../bookings/PaymentPlanCard";
import { planTitle } from "../bookings/planTitle";

/** Bookings that carry (or will carry) a payment plan. Rejected / cancelled ones don't. */
const PLAN_STATUSES: BookingStatus[] = ["booked", "pending_kyc_review"];
const PAGE_SIZE = 100;
const MAX_PAGES = 5;

/**
 * Every booking for one customer. `customer_id` is an exact filter on backends that
 * support it; older ones ignore it and fall back to `search`, a substring match over
 * booking id / customer id / project name — so results are always narrowed to an
 * exact customer_id match here.
 */
async function listCustomerBookings(accessToken: string, customerId: string) {
  const { items, truncated } = await fetchPages(
    (page) => listBookings(accessToken, { page, page_size: PAGE_SIZE, customer_id: customerId, search: customerId }),
    { maxPages: MAX_PAGES }
  );
  return { bookings: items.filter((item) => item.customer_id === customerId), truncated };
}

function errorMessage(err: unknown, fallback: string) {
  return err instanceof ApiError && err.message ? err.message : fallback;
}

interface Entry {
  item: ApiBookingListItem;
  detail: ApiBookingDetail | null;
  error: string | null;
  loading: boolean;
}

/** Mount with key={customerId} so switching customers starts from a clean state. */
export function CustomerPaymentPlans({ accessToken, customerId }: { accessToken: string; customerId: string }) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // Existing cards stay on screen while this runs (e.g. after a token refresh).
    listCustomerBookings(accessToken, customerId)
      .then(async ({ bookings, truncated }) => {
        const relevant = bookings.filter((item) => PLAN_STATUSES.includes(item.status));
        const results = await Promise.allSettled(relevant.map((item) => getBooking(accessToken, item.id)));
        if (cancelled) return;
        setListError(null);
        setTruncated(truncated);
        setEntries(
          relevant.map((item, i) => {
            const result = results[i];
            return result.status === "fulfilled"
              ? { item, detail: result.value, error: null, loading: false }
              : {
                  item,
                  detail: null,
                  error: errorMessage(result.reason, "The payment plan for this booking could not be loaded."),
                  loading: false,
                };
          })
        );
      })
      .catch((err) => {
        if (!cancelled) setListError(errorMessage(err, "Failed to load payment plans."));
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, customerId, reloadKey]);

  /** Retries just one booking, leaving the other cards as they are. */
  const retryBooking = useCallback(
    (bookingId: string) => {
      const patch = (changes: Partial<Entry>) =>
        setEntries((list) => list?.map((e) => (e.item.id === bookingId ? { ...e, ...changes } : e)) ?? list);
      patch({ loading: true, error: null });
      getBooking(accessToken, bookingId)
        .then((detail) => patch({ detail, loading: false }))
        .catch((err) =>
          patch({ loading: false, error: errorMessage(err, "The payment plan for this booking could not be loaded.") })
        );
    },
    [accessToken]
  );

  if (listError && !entries) {
    return (
      <Card className="p-5">
        <PlanCardHeader title="Payment Plan" />
        <p className="mb-3 text-sm text-text-muted">{listError}</p>
        <Button variant="outline" size="sm" onClick={() => setReloadKey((k) => k + 1)}>
          Try again
        </Button>
      </Card>
    );
  }

  if (!entries) {
    return <Card className="p-5 text-sm text-text-muted">Loading payment plans...</Card>;
  }

  return (
    <>
      {truncated && (
        <div className="rounded-xl border border-warning/30 bg-warning-bg p-3 text-sm text-warning">
          Only some of this customer's bookings could be checked. Open the Bookings page to see all of them.
        </div>
      )}

      {entries.length === 0 && (
        <Card className="p-5">
          <PlanCardHeader title="Payment Plan" />
          <p className="text-sm text-text-muted">
            This customer has no active bookings, so there is no payment plan yet.
          </p>
        </Card>
      )}

      {entries.map(({ item, detail, error, loading }) => {
        const plot = [item.project_name, item.unit_number && `Plot ${item.unit_number}`].filter(Boolean).join(" · ");
        const title = `Payment Plan${plot ? ` — ${plot}` : ""}`;
        const action = (
          <div className="flex items-center gap-3">
            <StatusBadge status={item.status.toUpperCase()} />
            <Link to={`/admin/bookings/${item.id}`} className="text-xs font-semibold text-gold-dark hover:underline">
              Open booking
            </Link>
          </div>
        );
        const simpleCard = (body: ReactNode) => (
          <Card key={item.id} className="p-5">
            <PlanCardHeader title={title} planName={planTitle(detail?.payment_plan)} action={action} />
            {body}
          </Card>
        );

        // Same rule as the booking page: the instalment schedule is shown once the booking is approved.
        if (item.status !== "booked") {
          return simpleCard(
            <p className="text-sm text-text-muted">
              This booking is under KYC review. Its instalments appear here once the booking is approved.
            </p>
          );
        }

        if (!detail) {
          return simpleCard(
            <>
              <p className="mb-3 text-sm text-text-muted">{loading ? "Loading..." : error}</p>
              <Button variant="outline" size="sm" disabled={loading} onClick={() => retryBooking(item.id)}>
                Try again
              </Button>
            </>
          );
        }

        return (
          <SectionErrorBoundary key={item.id} title={title} resetKey={detail}>
            <PaymentPlanCard readOnly booking={detail} title={title} headerAction={action} />
          </SectionErrorBoundary>
        );
      })}
    </>
  );
}
