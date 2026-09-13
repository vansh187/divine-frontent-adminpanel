import { useEffect, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { Avatar } from "../../components/ui/Avatar";
import { BackLink } from "../../components/ui/BackLink";
import { Card } from "../../components/ui/Card";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { ApiError, listCustomers, type ApiCustomer } from "../../lib/api";
import { useAuth } from "../../lib/auth";

interface CustomerRouteState {
  customer?: ApiCustomer;
}

function readCachedCustomer(id: string | undefined) {
  if (!id) return null;
  const value = sessionStorage.getItem(`dvi_customer_${id}`);
  if (!value) return null;

  try {
    return JSON.parse(value) as ApiCustomer;
  } catch {
    return null;
  }
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function CustomerDetailPage() {
  const { id } = useParams();
  const { accessToken } = useAuth();
  const location = useLocation();
  const routeCustomer = (location.state as CustomerRouteState | null)?.customer;

  const [customer, setCustomer] = useState<ApiCustomer | null>(() => routeCustomer ?? readCachedCustomer(id));
  const [loading, setLoading] = useState(!customer);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !accessToken || customer?.id === id) return;

    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    listCustomers(accessToken, { page: 1, page_size: 100, search: id })
      .then((res) => {
        if (cancelled) return;
        const match = res.items.find((item) => item.id === id) ?? null;
        setCustomer(match);
        if (match) {
          sessionStorage.setItem(`dvi_customer_${match.id}`, JSON.stringify(match));
        } else {
          setLoadError("Customer details are not available. Please open the record from the customers list.");
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof ApiError ? err.message : "Failed to load customer details.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, customer?.id, id]);

  return (
    <div>
      <BackLink to="/admin/customers" label="Back to customers" />

      {loading && (
        <Card className="p-10 text-center text-sm text-text-muted">Loading customer profile...</Card>
      )}

      {!loading && loadError && (
        <Card className="p-10 text-center text-sm text-text-muted">{loadError}</Card>
      )}

      {!loading && customer && (
        <>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Avatar name={customer.full_name || "Unnamed lead"} className="h-14 w-14 text-base" />
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold text-text">{customer.full_name || "Unnamed lead"}</h1>
                  <StatusBadge status={customer.status} />
                </div>
                <p className="text-sm text-text-muted">{customer.id}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <Card className="p-5">
                <h3 className="mb-4 text-sm font-bold text-text">Customer Profile</h3>
                <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-text-muted">Full name</dt>
                    <dd className="font-medium text-text">{customer.full_name || "-"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-text-muted">Customer ID</dt>
                    <dd className="font-medium text-text">{customer.id}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-text-muted">Email</dt>
                    <dd className="font-medium text-text">{customer.email ?? "-"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-text-muted">Phone</dt>
                    <dd className="font-medium text-text">{customer.phone ?? "-"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-text-muted">Created</dt>
                    <dd className="font-medium text-text">{formatDateTime(customer.created_at)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-text-muted">Last activity</dt>
                    <dd className="font-medium text-text">{formatDateTime(customer.last_activity_at)}</dd>
                  </div>
                </dl>
              </Card>

              <Card className="p-5">
                <h3 className="mb-4 text-sm font-bold text-text">Activity</h3>
                <ol className="space-y-4">
                  <li className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <span className="h-2.5 w-2.5 rounded-full bg-gold" />
                      <span className="mt-1 h-full w-px flex-1 bg-border" />
                    </div>
                    <div className="flex-1 pb-1">
                      <p className="text-sm font-semibold text-text">Last activity</p>
                      <p className="text-xs text-text-muted">{formatDateTime(customer.last_activity_at)}</p>
                    </div>
                  </li>
                  <li className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <span className="h-2.5 w-2.5 rounded-full bg-gold" />
                    </div>
                    <div className="flex-1 pb-1">
                      <p className="text-sm font-semibold text-text">Customer record created</p>
                      <p className="text-xs text-text-muted">{formatDateTime(customer.created_at)}</p>
                    </div>
                  </li>
                </ol>
              </Card>
            </div>

            <div className="space-y-6">
              <Card className="p-5">
                <h3 className="mb-4 text-sm font-bold text-text">Status</h3>
                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className="text-xs text-text-muted">Source</dt>
                    <dd>
                      <StatusBadge
                        status={customer.source}
                        label={customer.source === "WEBSITE" ? "Website" : "Channel Partner"}
                      />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-text-muted">Current status</dt>
                    <dd>
                      <StatusBadge status={customer.status} />
                    </dd>
                  </div>
                </dl>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
