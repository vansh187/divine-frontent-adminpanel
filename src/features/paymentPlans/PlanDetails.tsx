import { Card } from "../../components/ui/Card";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Table, Td, Th, THead, Tr } from "../../components/ui/Table";
import type { ApiPaymentPlan } from "../../lib/api";
import { formatCurrency, formatDateTime } from "../../lib/format";
import { CHARGE_HEAD_LABEL } from "./planLabels";


// Long labels (up to 150 chars) wrap instead of stretching the min-w-max table.
const LABEL_CELL = "min-w-[12rem] max-w-xs whitespace-normal break-words";

function chargeLabel(head: string | null | undefined) {
  if (!head) return "-";
  return CHARGE_HEAD_LABEL[head] ?? head.replace(/\+/g, " + ");
}

/** Plots currently on a plan code: the total and the split by plan version. */
export interface PlotUsage {
  total: number;
  byVersion: { version: number; count: number }[];
}

/**
 * A plan's details, instalment rules and the backend's worked example. `plotUsage` adds the
 * "Number of Plots Using This Payment Plan" field: pass null when the backend doesn't send
 * counts yet, leave it out where the field doesn't belong (e.g. a new plan's preview).
 */
export function PlanDetails({
  plan,
  showMeta = true,
  plotUsage,
}: {
  plan: ApiPaymentPlan;
  showMeta?: boolean;
  plotUsage?: PlotUsage | null;
}) {
  // Only worth splitting when customers are on more than one version.
  const usedVersions = plotUsage ? plotUsage.byVersion.filter((v) => v.count > 0) : [];
  const instalments = plan.instalments ?? [];
  const example = plan.example;

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-bold break-words text-text">{plan.name || plan.code}</h2>
            {plan.description && (
              <p className="mt-1 text-sm break-words whitespace-pre-line text-text-muted">{plan.description}</p>
            )}
          </div>
          {showMeta && typeof plan.is_active === "boolean" && (
            <StatusBadge status={plan.is_active ? "ACTIVE" : "INACTIVE"} />
          )}
        </div>
        <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3 lg:grid-cols-4">
          <div>
            <dt className="text-xs text-text-muted">Plan Code</dt>
            <dd className="font-semibold break-all text-text">{plan.code}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted">Short Code</dt>
            <dd className="font-semibold break-all text-text">{plan.short_code || "-"}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted">Project</dt>
            <dd className="font-semibold break-all text-text">{plan.project_id || "All projects"}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted">Booking Amount</dt>
            <dd className="font-semibold text-text">
              {typeof plan.booking_percent === "number" ? `${plan.booking_percent}% of BSP` : "-"}
            </dd>
          </div>
          {showMeta && (
            <>
              <div>
                <dt className="text-xs text-text-muted">Version</dt>
                <dd className="font-semibold text-text">v{plan.version}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted">Created</dt>
                <dd className="font-semibold text-text">{formatDateTime(plan.created_date)}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted">Last Updated</dt>
                <dd className="font-semibold text-text">{formatDateTime(plan.last_updated_date)}</dd>
              </div>
            </>
          )}
          {plotUsage !== undefined && (
            <div>
              <dt className="text-xs text-text-muted">Number of Plots Using This Payment Plan</dt>
              {plotUsage ? (
                <dd className="font-semibold text-text">
                  {plotUsage.total}
                  {usedVersions.length > 1 && (
                    <span className="block text-xs font-normal text-text-muted">
                      {usedVersions.map((v) => `v${v.version}: ${v.count}`).join(" · ")}
                    </span>
                  )}
                </dd>
              ) : (
                <dd className="font-semibold text-text">
                  -<span className="block text-xs font-normal text-text-muted">Available after the server update</span>
                </dd>
              )}
            </div>
          )}
        </dl>
        {plan.valid === false && (
          <div className="mt-4 rounded-xl border border-danger/30 bg-danger-bg p-3 text-sm text-danger">
            This plan's stored instalments are invalid, so it can't be shown or used for new bookings.
          </div>
        )}
      </Card>

      {instalments.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-bold text-text">Instalments</h3>
          <Table>
            <THead>
              <Th>#</Th>
              <Th>Instalment</Th>
              <Th>% of BSP</Th>
              <Th>Due</Th>
              <Th>Charges Added</Th>
            </THead>
            <tbody>
              {instalments.map((row) => (
                <Tr key={row.seq}>
                  <Td>{row.seq}</Td>
                  <Td className={LABEL_CELL}>
                    <span className="font-medium">{row.label}</span>
                  </Td>
                  <Td>{row.percent}%</Td>
                  <Td>{row.due_text}</Td>
                  <Td>{chargeLabel(row.charge_head)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      {example && example.rows.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-text">Worked Example</h3>
          <p className="mt-1 mb-3 text-xs text-text-muted">
            BSP {formatCurrency(example.sale_price)} · PLC {formatCurrency(example.plc)} · IFMS{" "}
            {formatCurrency(example.ifms)} · CAM {formatCurrency(example.cam)} · Total {formatCurrency(example.total)}
          </p>
          <Table>
            <THead>
              <Th>#</Th>
              <Th>Instalment</Th>
              <Th>Due</Th>
              <Th>Basic Amount</Th>
              <Th>Charges</Th>
              <Th>Total</Th>
            </THead>
            <tbody>
              {example.rows.map((row) => (
                <Tr key={row.seq}>
                  <Td>{row.seq}</Td>
                  <Td className={LABEL_CELL}>
                    <p className="font-medium">{row.label}</p>
                    <p className="text-xs text-text-muted">{row.percent}% of BSP</p>
                  </Td>
                  <Td>{row.due_text}</Td>
                  <Td>{formatCurrency(row.basic_amount)}</Td>
                  <Td>
                    {row.charge_amount ? (
                      <>
                        {formatCurrency(row.charge_amount)}
                        <p className="text-xs text-text-muted">{chargeLabel(row.charge_head)}</p>
                      </>
                    ) : (
                      "-"
                    )}
                  </Td>
                  <Td className="font-semibold">{formatCurrency(row.amount)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}
    </div>
  );
}
