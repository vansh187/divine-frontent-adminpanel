import { useState, type FormEvent } from "react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { TextField } from "../../components/ui/TextField";
import {
  ApiError,
  downloadPlotDemandLetter,
  setPlotPaymentTerms,
  type ApiCustomerPlot,
  type PlotPaymentTermsPayload,
} from "../../lib/api";
import { saveBlob } from "../../lib/download";
import { formatCurrency, formatDate, localDateISO } from "../../lib/format";
import { PlanCardHeader } from "../bookings/PaymentPlanCard";
import { planTitle } from "../bookings/planTitle";

/** Backend error codes for a plot's terms, worded for the admin. */
const TERMS_ERRORS: Record<string, string> = {
  plot_not_found: "This plot doesn't belong to this customer.",
  terms_from_website_booking: "A website booking's plan comes from its payment and can't be changed here.",
  schedule_has_payments: "An instalment of this plot was already paid online, so its terms can't be changed.",
  payment_plan_not_found: "No active payment plan matches this name. Use its code, e.g. PP1.",
  payment_plan_ambiguous: "More than one plan matches. Use the plan's code, e.g. PP1.",
  payment_plan_not_for_project: "This payment plan belongs to another project.",
  invalid_booking_date: "Check the booking date.",
  booking_date_in_future: "The booking date can't be in the future.",
  sale_price_required: "Enter the sale price before PLC, IFMS, CAM or the amount received.",
  amount_received_exceeds_total: "The amount received is more than the plot's total.",
  sale_price_too_small: "The sale price is too small for this plan.",
  total_amount_too_large: "The total is too large. Check the amounts.",
  payment_details_pending: "Enter this plot's prices first.",
};

/** A plot's terms status, worded for the admin (the plot card and the plots summary). */
export const TERMS_STATUS_LABELS: Record<ApiCustomerPlot["terms_status"], string> = {
  plan_needed: "Plan needed",
  price_needed: "Price needed",
  complete: "Schedule ready",
};

function errorText(err: unknown, fallback: string) {
  if (err instanceof ApiError) return (err.code && TERMS_ERRORS[err.code]) || err.message || fallback;
  return fallback;
}

function amount(value: number | null) {
  return value == null ? "—" : formatCurrency(value);
}

/**
 * "" -> null; otherwise the number (the form only allows numbers). Saving replaces the plot's
 * terms, so a cleared field is sent as an explicit null: it removes that value.
 */
function optionalNumber(value: string): number | null {
  return value.trim() === "" ? null : Number(value);
}

interface TermsForm {
  payment_plan: string;
  booking_date: string;
  sale_price: string;
  plc: string;
  ifms: string;
  cam: string;
  amount_received: string;
}

function formFrom(plot: ApiCustomerPlot): TermsForm {
  const text = (v: number | null) => (v == null ? "" : String(v));
  return {
    payment_plan: plot.payment_plan?.short_code || plot.payment_plan?.code || "",
    booking_date: plot.booking_date ?? "",
    sale_price: text(plot.sale_price),
    plc: text(plot.plc),
    ifms: text(plot.ifms),
    cam: text(plot.cam),
    amount_received: text(plot.amount_received),
  };
}

/**
 * The payment plan of an offline buyer's plot (one bought offline and loaded from the client's
 * sheets): its plan and booking date, prices, amount received, instalments and demand letter.
 * The admin links the plan and enters the prices here.
 */
export function OfflinePlotPlanCard({
  accessToken,
  customerId,
  plot,
  onSaved,
}: {
  accessToken: string;
  customerId: string;
  plot: ApiCustomerPlot;
  onSaved: (plot: ApiCustomerPlot) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<TermsForm>(() => formFrom(plot));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const place = [plot.project_name, plot.unit_number && `Plot ${plot.unit_number}`].filter(Boolean).join(" · ");
  const title = `Payment Plan${place ? ` — ${place}` : ""}`;
  const planName = planTitle(plot.payment_plan);
  const coApplicants = plot.co_applicant_names ?? [];
  const today = localDateISO();
  // Saving replaces the plot's terms: without a sale price its instalments and demand letter go.
  const dropsSchedule = plot.sale_price != null && form.sale_price.trim() === "";

  const set = (key: keyof TermsForm) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  function startEditing() {
    setForm(formFrom(plot));
    setError(null);
    setEditing(true);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form.payment_plan.trim() || !form.booking_date) {
      setError("Enter the payment plan and the booking date.");
      return;
    }
    const payload: PlotPaymentTermsPayload = {
      payment_plan: form.payment_plan.trim(),
      booking_date: form.booking_date,
      sale_price: optionalNumber(form.sale_price),
      plc: optionalNumber(form.plc),
      ifms: optionalNumber(form.ifms),
      cam: optionalNumber(form.cam),
      amount_received: optionalNumber(form.amount_received),
    };
    setSaving(true);
    setError(null);
    try {
      const saved = await setPlotPaymentTerms(accessToken, customerId, plot.document_id, payload);
      setEditing(false);
      onSaved(saved);
    } catch (err) {
      setError(errorText(err, "The payment plan could not be saved. Please try again."));
    } finally {
      setSaving(false);
    }
  }

  async function downloadLetter() {
    setDownloading(true);
    setDownloadError(null);
    try {
      const { blob, filename } = await downloadPlotDemandLetter(accessToken, customerId, plot.document_id);
      saveBlob(blob, filename ?? `Demand-Letter-${plot.unit_number ?? plot.document_id}.pdf`);
    } catch (err) {
      setDownloadError(errorText(err, "The demand letter could not be downloaded. Please try again."));
    } finally {
      setDownloading(false);
    }
  }

  const action = (
    <div className="flex items-center gap-2">
      <StatusBadge status="OFFLINE" label="Offline buyer" tone="info" />
      <StatusBadge
        status={plot.terms_status}
        label={TERMS_STATUS_LABELS[plot.terms_status]}
        tone={plot.terms_status === "complete" ? "success" : "warning"}
      />
    </div>
  );

  return (
    <Card className="p-5">
      <PlanCardHeader title={title} planName={planName} action={action} />
      {(plot.applicant_name || coApplicants.length > 0) && (
        <p className="-mt-2 mb-4 text-sm text-text">
          Applicant: <span className="font-semibold">{plot.applicant_name ?? "—"}</span>
          {coApplicants.length > 0 && (
            <>
              <span className="text-text-muted"> · Co-applicant{coApplicants.length > 1 ? "s" : ""}: </span>
              <span className="font-semibold">{coApplicants.join(", ")}</span>
            </>
          )}
        </p>
      )}

      {editing ? (
        <form onSubmit={save} className="space-y-4" aria-label="Payment terms">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField
              label="Payment plan"
              hint="Plan code (e.g. PP1) or the client's label"
              value={form.payment_plan}
              onChange={set("payment_plan")}
              maxLength={80}
              required
            />
            <TextField
              label="Booking date"
              type="date"
              max={today}
              value={form.booking_date}
              onChange={set("booking_date")}
              required
            />
            <TextField label="Basic sale price (₹)" type="number" min={1} step="any"
              value={form.sale_price} onChange={set("sale_price")} />
            <TextField label="Amount received to date (₹)" type="number" min={0} step="any"
              value={form.amount_received} onChange={set("amount_received")} />
            <TextField label="PLC (₹)" type="number" min={0} step="any" value={form.plc} onChange={set("plc")} />
            <TextField label="IFMS (₹)" type="number" min={0} step="any" value={form.ifms} onChange={set("ifms")} />
            <TextField label="CAM (₹)" type="number" min={0} step="any" value={form.cam} onChange={set("cam")} />
          </div>
          <p className="text-xs text-text-muted">
            Leave the prices blank to save just the plan and booking date. With a sale price, the instalments are
            built from the plan and the amount received is marked against them, oldest first.
          </p>
          {dropsSchedule && (
            <p role="status" className="rounded-lg bg-warning-bg p-3 text-sm text-warning">
              Without a sale price, saving removes this plot's prices, its instalments and its demand letter. Only the
              plan and booking date are kept.
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <>
          {plot.terms_status === "plan_needed" ? (
            <p className="mb-4 text-sm text-text-muted">No payment plan is linked to this plot yet.</p>
          ) : (
            <dl className="mb-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
              <Item label="Booking date" value={formatDate(plot.booking_date)} />
              <Item label="Plan code" value={plot.payment_plan?.code ?? "—"} />
              <Item label="Basic sale price" value={amount(plot.sale_price)} />
              <Item label="PLC / IFMS / CAM" value={[plot.plc, plot.ifms, plot.cam].map(amount).join(" / ")} />
              <Item label="Total" value={amount(plot.total)} />
              <Item label="Received / Outstanding" value={`${amount(plot.amount_received)} / ${amount(plot.outstanding)}`} />
            </dl>
          )}

          {plot.terms_status === "price_needed" && (
            <p className="mb-4 rounded-lg bg-warning-bg p-3 text-sm text-warning">
              Enter this plot's prices to build its instalments and issue the demand letter.
            </p>
          )}

          {plot.schedule.length > 0 && (
            <div className="mb-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-text-muted">
                    <th className="py-2 pr-3 font-medium">#</th>
                    <th className="py-2 pr-3 font-medium">Instalment</th>
                    <th className="py-2 pr-3 font-medium">Due date</th>
                    <th className="py-2 pr-3 text-right font-medium">Amount</th>
                    <th className="py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {plot.schedule.map((row, i) => (
                    <tr key={row.milestone_no ?? i} className="border-t border-border">
                      <td className="py-2 pr-3 text-text-muted">{row.milestone_no ?? i + 1}</td>
                      <td className="py-2 pr-3 text-text">
                        {row.label}
                        {row.percent != null && <span className="text-text-muted"> ({row.percent}%)</span>}
                      </td>
                      <td className="py-2 pr-3 text-text">{row.due_date ? formatDate(row.due_date) : "Not dated yet"}</td>
                      <td className="py-2 pr-3 text-right text-text">{formatCurrency(row.amount)}</td>
                      <td className="py-2">
                        <StatusBadge status={row.status.toUpperCase()} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {plot.demand_letter_available && (
              <Button size="sm" disabled={downloading} onClick={downloadLetter}>
                {downloading ? "Preparing..." : "Download demand letter"}
              </Button>
            )}
            {plot.terms_editable && (
              <Button variant="outline" size="sm" onClick={startEditing}>
                {plot.terms_status === "plan_needed"
                  ? "Link payment plan"
                  : plot.terms_status === "price_needed"
                    ? "Enter prices"
                    : "Edit terms"}
              </Button>
            )}
          </div>
          {downloadError && (
            <p role="alert" className="mt-2 text-sm text-danger">
              {downloadError}
            </p>
          )}
        </>
      )}
    </Card>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd className="font-semibold text-text">{value}</dd>
    </div>
  );
}
