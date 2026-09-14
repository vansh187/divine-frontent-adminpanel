import { useEffect, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { Avatar } from "../../components/ui/Avatar";
import { BackLink } from "../../components/ui/BackLink";
import { Card } from "../../components/ui/Card";
import { StatusBadge } from "../../components/ui/StatusBadge";
import {
  ApiError,
  listBrokers,
  type ApiBroker,
  type BrokerProject,
} from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { formatDateTime } from "../../lib/format";

interface BrokerRouteState {
  broker?: ApiBroker;
}

function readCachedBroker(id: string | undefined) {
  if (!id) return null;
  const value = sessionStorage.getItem(`dvi_broker_${id}`);
  if (!value) return null;

  try {
    return JSON.parse(value) as ApiBroker;
  } catch {
    return null;
  }
}

function projectLabel(project: BrokerProject) {
  if (project === "suraksha-enclave") return "Suraksha Enclave";
  return "Ops Divine Greens";
}

export function BrokerDetailPage() {
  const { id } = useParams();
  const { accessToken } = useAuth();
  const location = useLocation();
  const routeBroker = (location.state as BrokerRouteState | null)?.broker;

  const [broker, setBroker] = useState<ApiBroker | null>(() => routeBroker ?? readCachedBroker(id));
  const [loading, setLoading] = useState(!broker);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !accessToken || broker?.id === id) return;

    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    listBrokers(accessToken, { page: 1, page_size: 100, search: id })
      .then((res) => {
        if (cancelled) return;
        const match = res.items.find((item) => item.id === id) ?? null;
        setBroker(match);
        if (match) {
          sessionStorage.setItem(`dvi_broker_${match.id}`, JSON.stringify(match));
        } else {
          setLoadError("Channel partner details are not available. Please open the record from the channel partners list.");
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof ApiError ? err.message : "Failed to load channel partner details.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, broker?.id, id]);

  return (
    <div>
      <BackLink to="/admin/brokers" label="Back to channel partners" />

      {loading && (
        <Card className="p-10 text-center text-sm text-text-muted">Loading channel partner profile...</Card>
      )}

      {!loading && loadError && (
        <Card className="p-10 text-center text-sm text-text-muted">{loadError}</Card>
      )}

      {!loading && broker && (
        <>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Avatar name={broker.full_name || "Unnamed partner"} className="h-14 w-14 text-base" />
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold text-text">{broker.full_name || "Unnamed partner"}</h1>
                  <StatusBadge status={broker.project} label={projectLabel(broker.project)} />
                </div>
                <p className="text-sm text-text-muted">{broker.id}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <Card className="p-5">
                <h3 className="mb-4 text-sm font-bold text-text">Channel Partner Profile</h3>
                <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-text-muted">Full name</dt>
                    <dd className="font-medium text-text">{broker.full_name || "-"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-text-muted">Partner ID</dt>
                    <dd className="font-medium text-text">{broker.id}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-text-muted">Email</dt>
                    <dd className="font-medium text-text">{broker.email ?? "-"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-text-muted">Phone</dt>
                    <dd className="font-medium text-text">{broker.phone ?? "-"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-text-muted">Created</dt>
                    <dd className="font-medium text-text">{formatDateTime(broker.created_at)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-text-muted">Last activity</dt>
                    <dd className="font-medium text-text">{formatDateTime(broker.last_activity_at)}</dd>
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
                      <p className="text-xs text-text-muted">{formatDateTime(broker.last_activity_at)}</p>
                    </div>
                  </li>
                  <li className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <span className="h-2.5 w-2.5 rounded-full bg-gold" />
                    </div>
                    <div className="flex-1 pb-1">
                      <p className="text-sm font-semibold text-text">Channel partner record created</p>
                      <p className="text-xs text-text-muted">{formatDateTime(broker.created_at)}</p>
                    </div>
                  </li>
                </ol>
              </Card>
            </div>

            <div className="space-y-6">
              <Card className="p-5">
                <h3 className="mb-4 text-sm font-bold text-text">Assigned Project</h3>
                <StatusBadge status={broker.project} label={projectLabel(broker.project)} />
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
