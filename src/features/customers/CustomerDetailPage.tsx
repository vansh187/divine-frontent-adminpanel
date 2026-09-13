import { useParams } from "react-router-dom";
import { Avatar } from "../../components/ui/Avatar";
import { BackLink } from "../../components/ui/BackLink";
import { Card } from "../../components/ui/Card";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { customers, siteVisits } from "../../lib/mockData";

const activityTimeline = [
  { id: 1, title: "Site visit completed", detail: "Green Meadows · Plot A-112", timestamp: "2026-09-10 11:20 AM" },
  { id: 2, title: "Follow-up call scheduled", detail: "Regarding plot pricing", timestamp: "2026-09-08 04:15 PM" },
  { id: 3, title: "Lead created", detail: "Sourced via website enquiry form", timestamp: "2026-08-02 09:00 AM" },
];

export function CustomerDetailPage() {
  const { id } = useParams();
  const customer = customers.find((c) => c.id === id) ?? customers[0];

  return (
    <div>
      <BackLink to="/admin/customers" label="Back to customers" />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar name={customer.name} className="h-14 w-14 text-base" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-text">{customer.name}</h1>
              <StatusBadge status={customer.status} />
            </div>
            <p className="text-sm text-text-muted">
              {customer.id} · {customer.project}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-5">
            <h3 className="mb-4 text-sm font-bold text-text">Activity Timeline</h3>
            <ol className="space-y-4">
              {activityTimeline.map((item, i) => (
                <li key={item.id} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <span className="h-2.5 w-2.5 rounded-full bg-gold" />
                    {i < activityTimeline.length - 1 && <span className="mt-1 h-full w-px flex-1 bg-border" />}
                  </div>
                  <div className="flex-1 pb-1">
                    <p className="text-sm font-semibold text-text">{item.title}</p>
                    <p className="text-xs text-text-muted">{item.detail}</p>
                    <p className="mt-0.5 text-xs text-text-soft">{item.timestamp}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>

          <Card className="p-5">
            <h3 className="mb-4 text-sm font-bold text-text">Site Visits</h3>
            <div className="space-y-3">
              {siteVisits
                .filter((v) => v.customerName === customer.name)
                .concat(siteVisits.slice(0, 1))
                .slice(0, 2)
                .map((v) => (
                  <div key={v.id} className="flex items-center justify-between rounded-xl border border-border p-3">
                    <div>
                      <p className="text-sm font-semibold text-text">
                        {v.project} · Plot {v.plot}
                      </p>
                      <p className="text-xs text-text-muted">{v.scheduledAt}</p>
                    </div>
                    <StatusBadge status={v.status} />
                  </div>
                ))}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <h3 className="mb-4 text-sm font-bold text-text">Contact Details</h3>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs text-text-muted">Email</dt>
                <dd className="font-medium text-text">{customer.email}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted">Phone</dt>
                <dd className="font-medium text-text">{customer.phone}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted">Source</dt>
                <dd>
                  <StatusBadge status={customer.source} label={customer.source === "CUSTOMER" ? "Direct" : "Broker Channel"} />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted">Created</dt>
                <dd className="font-medium text-text">{customer.createdAt}</dd>
              </div>
            </dl>
          </Card>

          <Card className="p-5">
            <h3 className="mb-4 text-sm font-bold text-text">Summary</h3>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-text-muted">Site visits</dt>
                <dd className="font-semibold text-text">{customer.siteVisits}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-text-muted">Interested project</dt>
                <dd className="font-semibold text-text">{customer.project}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-text-muted">Last activity</dt>
                <dd className="font-semibold text-text">{customer.lastActivity}</dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}
