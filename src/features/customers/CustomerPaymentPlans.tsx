import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { SectionErrorBoundary } from "../../components/SectionErrorBoundary";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { StatusBadge } from "../../components/ui/StatusBadge";
import {
  ApiError,
  getBooking,
  getCustomerDetail,
  listBookings,
  type ApiBookingDetail,
  type ApiBookingListItem,
  type ApiCustomerPlot,
  type BookingStatus,
} from "../../lib/api";
import { fetchPages } from "../../lib/pagination";
import { PaymentPlanCard, PlanCardHeader } from "../bookings/PaymentPlanCard";
import { planTitle } from "../bookings/planTitle";
import { OfflinePlotPlanCard, TERMS_STATUS_LABELS } from "./OfflinePlotPlanCard";

interface PlotPlanRow {
  key: string;
  project: string | null;
  plot: string | null;
  applicant: string | null;
  plan: string | null;
  status: string;
  kind: "Website booking" | "Offline buyer";
}

const SALUTATION = /^(mr|mrs|ms|miss|dr|shri|sh|smt|kumari|km)\.?\s+/i;

/**
 * Compares applicant names the way people read them: "Mr. Sunil Kumar", "sunil  kumar" and
 * "Sunil Kumar" are one person. Only a leading salutation, case and spacing are ignored.
 */
export function applicantKey(name: string): string {
  let key = name.trim().replace(/\s+/g, " ");
  while (SALUTATION.test(key)) key = key.replace(SALUTATION, "");
  return key.toLowerCase();
}

/** The distinct applicants, each under the first spelling seen. */
export function distinctApplicants(names: (string | null | undefined)[]): string[] {
  const byKey = new Map<string, string>();
  for (const name of names) {
    const shown = name?.trim().replace(/\s+/g, " ");
    if (!shown) continue;
    const key = applicantKey(shown);
    if (key && !byKey.has(key)) byKey.set(key, shown);
  }
  return [...byKey.values()];
}

/** Project, then plot in natural order ("A-9" before "A-10", "A-100" before "B-2"). */
export function comparePlotRows(
  a: { project: string | null; plot: string | null },
  b: { project: string | null; plot: string | null }
): number {
  return (
    (a.project ?? "").localeCompare(b.project ?? "") ||
    (a.plot ?? "").localeCompare(b.plot ?? "", undefined, { numeric: true, sensitivity: "base" })
  );
}

/** Which plot is on which payment plan, for a customer holding more than one plot. */
function PlotPlanSummary({ rows }: { rows: PlotPlanRow[] }) {
  // Buyers who share an email share one account, but each plot keeps its own applicant.
  const applicants = distinctApplicants(rows.map((r) => r.applicant));
  return (
    <Card className="p-5">
      <PlanCardHeader title="Plots and payment plans" />
      {applicants.length > 1 && (
        <p className="mb-4 rounded-lg bg-info-bg p-3 text-sm text-info">
          This account's email is shared by {applicants.length} applicants ({applicants.join(", ")}). Each plot is
          listed with its own applicant, and its demand letter is addressed to that applicant.
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm" aria-label="Plots and payment plans">
          <thead>
            <tr className="text-left text-xs text-text-muted">
              <th className="py-2 pr-3 font-medium">Plot</th>
              <th className="py-2 pr-3 font-medium">Applicant</th>
              <th className="py-2 pr-3 font-medium">Project</th>
              <th className="py-2 pr-3 font-medium">Payment plan</th>
              <th className="py-2 pr-3 font-medium">Status</th>
              <th className="py-2 font-medium">Type</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-t border-border">
                <td className="py-2 pr-3 font-semibold text-text">{row.plot ?? "—"}</td>
                <td className="py-2 pr-3 text-text">{row.applicant ?? "—"}</td>
                <td className="py-2 pr-3 text-text">{row.project ?? "—"}</td>
                <td className="py-2 pr-3 text-text">{row.plan ?? "Not linked yet"}</td>
                <td className="py-2 pr-3 text-text">{row.status}</td>
                <td className="py-2 text-text-muted">{row.kind}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

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

/**
 * The customer's plots bought offline (loaded from the client's sheets). They have no website
 * booking; their plan, prices and demand letter come from GET /admin/customers/{id}. An older
 * backend without that endpoint (404) just means no offline plots.
 */
async function listOfflinePlots(accessToken: string, customerId: string): Promise<ApiCustomerPlot[]> {
  try {
    const detail = await getCustomerDetail(accessToken, customerId);
    return detail.plots.filter((plot) => plot.record_type === "offline");
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return [];
    throw err;
  }
}

function errorMessage(err: unknown, fallback: string) {
  return err instanceof ApiError && err.message ? err.message : fallback;
}

/** One half of the page (bookings or offline plots) failed to load: say so, and offer a retry. */
function LoadError({ message, onRetry }: { message: string | null; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-danger/30 bg-danger-bg p-3 text-sm text-danger">
      <span className="min-w-0 flex-1">{message}</span>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
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
  // Bookings and offline plots load (and are retried) separately, so one failing never hides the other.
  const [bookingsReloadKey, setBookingsReloadKey] = useState(0);
  const [offlineReloadKey, setOfflineReloadKey] = useState(0);
  const [offlinePlots, setOfflinePlots] = useState<ApiCustomerPlot[] | null>(null);
  const [offlineError, setOfflineError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listOfflinePlots(accessToken, customerId)
      .then((plots) => {
        if (cancelled) return;
        setOfflineError(null);
        setOfflinePlots(plots);
      })
      .catch((err) => {
        if (cancelled) return;
        setOfflineError(errorMessage(err, "This customer's offline plots could not be loaded."));
        setOfflinePlots((current) => current ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, customerId, offlineReloadKey]);

  const replaceOfflinePlot = useCallback((saved: ApiCustomerPlot) => {
    setOfflinePlots((plots) => plots?.map((p) => (p.document_id === saved.document_id ? saved : p)) ?? plots);
  }, []);

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
        if (!cancelled) setListError(errorMessage(err, "This customer's website bookings could not be loaded."));
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, customerId, bookingsReloadKey]);

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

  const bookingsFailed = !!listError && !entries;
  // Wait for both halves (or a failure) so the page doesn't jump as the second one arrives.
  if ((!entries && !bookingsFailed) || !offlinePlots) {
    return <Card className="p-5 text-sm text-text-muted">Loading payment plans...</Card>;
  }
  const bookings = entries ?? [];
  // The summary is only shown when it lists every plot.
  const complete = !bookingsFailed && !offlineError;

  return (
    <>
      {truncated && (
        <div className="rounded-xl border border-warning/30 bg-warning-bg p-3 text-sm text-warning">
          Only some of this customer's bookings could be checked. Open the Bookings page to see all of them.
        </div>
      )}

      {complete && bookings.length + offlinePlots.length > 1 && (
        <PlotPlanSummary
          rows={[
            ...offlinePlots.map(
              (plot): PlotPlanRow => ({
                key: `offline-${plot.document_id}`,
                project: plot.project_name,
                plot: plot.unit_number,
                applicant: plot.applicant_name,
                plan: planTitle(plot.payment_plan),
                status: TERMS_STATUS_LABELS[plot.terms_status],
                kind: "Offline buyer",
              })
            ),
            ...bookings.map(
              ({ item, detail }): PlotPlanRow => ({
                key: `booking-${item.id}`,
                project: item.project_name,
                plot: item.unit_number,
                applicant: detail?.customer_name ?? item.customer_name ?? null,
                plan: planTitle(detail?.payment_plan),
                status: item.status === "booked" ? "Booked" : "Under KYC review",
                kind: "Website booking",
              })
            ),
          ].sort(comparePlotRows)}
        />
      )}

      {bookingsFailed && (
        <LoadError message={listError} onRetry={() => setBookingsReloadKey((k) => k + 1)} />
      )}

      {offlineError && (
        <LoadError message={offlineError} onRetry={() => setOfflineReloadKey((k) => k + 1)} />
      )}

      {offlinePlots.map((plot) => (
        <OfflinePlotPlanCard
          key={plot.document_id}
          accessToken={accessToken}
          customerId={customerId}
          plot={plot}
          onSaved={replaceOfflinePlot}
        />
      ))}

      {complete && bookings.length === 0 && offlinePlots.length === 0 && (
        <Card className="p-5">
          <PlanCardHeader title="Payment Plan" />
          <p className="text-sm text-text-muted">
            This customer has no active bookings, so there is no payment plan yet.
          </p>
        </Card>
      )}

      {bookings.map(({ item, detail, error, loading }) => {
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
