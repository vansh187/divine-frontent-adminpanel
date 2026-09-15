import { useEffect, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { BackLink } from "../../components/ui/BackLink";
import { Card } from "../../components/ui/Card";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { ApiError, getVisit, type ApiVisit } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { formatDateTime } from "../../lib/format";
import { deriveStatus, projectLabel, scheduleLabel } from "../../lib/siteVisitDisplay";

interface VisitRouteState {
  visit?: ApiVisit;
}

function readCachedVisit(id: string | undefined) {
  if (!id) return null;
  const value = sessionStorage.getItem(`dvi_visit_${id}`);
  if (!value) return null;

  try {
    return JSON.parse(value) as ApiVisit;
  } catch {
    return null;
  }
}

function visitDisplayId(id: string) {
  return `VS${id.slice(-5).toUpperCase()}`;
}

export function SiteVisitDetailPage() {
  const { id } = useParams();
  const { accessToken } = useAuth();
  const location = useLocation();
  const routeVisit = (location.state as VisitRouteState | null)?.visit;

  const [visit, setVisit] = useState<ApiVisit | null>(() => routeVisit ?? readCachedVisit(id));
  const [loading, setLoading] = useState(!visit);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !accessToken || visit?.id === id) return;

    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    getVisit(accessToken, id)
      .then((result) => {
        if (cancelled) return;
        setVisit(result);
        sessionStorage.setItem(`dvi_visit_${result.id}`, JSON.stringify(result));
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(
          err instanceof ApiError && err.status === 404
            ? "Site visit not found."
            : err instanceof ApiError
              ? err.message
              : "Failed to load site visit details."
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, id, visit?.id]);

  return (
    <div>
      <BackLink to="/admin/site-visits" label="Back to site visits" />

      {loading && <Card className="p-10 text-center text-sm text-text-muted">Loading site visit...</Card>}

      {!loading && loadError && (
        <Card className="p-10 text-center text-sm text-text-muted">{loadError}</Card>
      )}

      {!loading && visit && (
        <>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-text">{visit.customer_name}</h1>
                <StatusBadge status={deriveStatus(visit).toUpperCase()} />
              </div>
              <p className="text-sm text-text-muted">{visitDisplayId(visit.id)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <Card className="p-5">
                <h3 className="mb-4 text-sm font-bold text-text">Visit Details</h3>
                <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-text-muted">Customer</dt>
                    <dd className="font-medium text-text">{visit.customer_name}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-text-muted">Contact</dt>
                    <dd className="font-medium text-text">{visit.customer_contact ?? "-"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-text-muted">Email</dt>
                    <dd className="font-medium text-text">{visit.customer_email ?? "-"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-text-muted">Project</dt>
                    <dd className="font-medium text-text">{projectLabel(visit.project_name)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-text-muted">Plot</dt>
                    <dd className="font-medium text-text">{visit.plot_number ?? "-"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-text-muted">Scheduled</dt>
                    <dd className="font-medium text-text">{scheduleLabel(visit)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-text-muted">Created</dt>
                    <dd className="font-medium text-text">{formatDateTime(visit.created_at)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-text-muted">Last activity</dt>
                    <dd className="font-medium text-text">{formatDateTime(visit.last_activity_at)}</dd>
                  </div>
                </dl>
              </Card>

              {visit.notes && (
                <Card className="p-5">
                  <h3 className="mb-2 text-sm font-bold text-text">Notes</h3>
                  <p className="text-sm text-text-muted">{visit.notes}</p>
                </Card>
              )}
            </div>

            <div className="space-y-6">
              <Card className="p-5">
                <h3 className="mb-4 text-sm font-bold text-text">Status</h3>
                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className="text-xs text-text-muted">Source</dt>
                    <dd>
                      <StatusBadge
                        status={visit.origin_type}
                        label={visit.origin_type === "CUSTOMER" ? "Website" : visit.source ?? "Channel Partner"}
                      />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-text-muted">Current status</dt>
                    <dd>
                      <StatusBadge status={deriveStatus(visit).toUpperCase()} />
                    </dd>
                  </div>
                  {visit.preferred_window && (
                    <div>
                      <dt className="text-xs text-text-muted">Preferred window</dt>
                      <dd className="font-medium text-text">{visit.preferred_window}</dd>
                    </div>
                  )}
                </dl>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
