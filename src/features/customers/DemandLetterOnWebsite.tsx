import { useEffect, useId, useRef, useState } from "react";
import { ApiError, setPlotDemandLetterOnWebsite, type ApiCustomerPlot } from "../../lib/api";

/** Backend error codes for the setting, worded for the admin. */
const ERRORS: Record<string, string> = {
  plot_not_found: "This plot doesn't belong to this customer.",
};

/**
 * "Show demand letter on website: Yes / No" for one plot: whether the customer can download this
 * plot's demand letter from their website account. Each plot has its own setting. Not shown on an
 * older backend that doesn't send it.
 */
export function DemandLetterOnWebsite({
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
  const id = useId();
  // The value being saved, shown until the server answers.
  const [saving, setSaving] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  if (typeof plot.demand_letter_on_website !== "boolean") return null;
  const current = plot.demand_letter_on_website;
  const shown = saving ?? current;
  const place = plot.unit_number ? `plot ${plot.unit_number}` : "this plot";

  async function change(value: boolean) {
    if (saving !== null || value === current) return;
    setSaving(value);
    setError(null);
    try {
      const saved = await setPlotDemandLetterOnWebsite(accessToken, customerId, plot.document_id, value);
      if (mounted.current) onSaved(saved);
    } catch (err) {
      if (!mounted.current) return;
      setError(
        (err instanceof ApiError && ((err.code && ERRORS[err.code]) || err.message)) ||
          "The setting could not be saved. Please try again."
      );
    } finally {
      if (mounted.current) setSaving(null);
    }
  }

  return (
    <div className="flex max-w-xs flex-col items-end gap-1 text-right">
      <div className="flex items-center gap-2">
        <label htmlFor={id} className="text-xs text-text-muted">
          Show demand letter on website
        </label>
        <select
          id={id}
          aria-label={`Show demand letter on website for ${place}`}
          value={shown ? "yes" : "no"}
          disabled={saving !== null}
          onChange={(e) => void change(e.target.value === "yes")}
          className="rounded-lg border border-border bg-surface px-2 py-1 text-xs font-semibold text-text focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20 disabled:opacity-60"
        >
          <option value="no">No</option>
          <option value="yes">Yes</option>
        </select>
      </div>
      {saving !== null ? (
        <span role="status" className="text-xs text-text-muted">
          Saving...
        </span>
      ) : error ? (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      ) : shown ? (
        !plot.demand_letter_available && (
          <span className="text-xs text-text-muted">The customer can download it once its prices are entered.</span>
        )
      ) : (
        <span className="text-xs text-text-muted">Download is disabled on the customer's website.</span>
      )}
    </div>
  );
}
