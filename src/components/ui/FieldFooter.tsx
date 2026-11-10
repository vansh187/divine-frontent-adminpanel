import clsx from "clsx";

interface FieldFooterProps {
  errorId?: string;
  error?: string | null;
  hint?: string;
  /** When set, shows "used / max" characters next to the hint or error. */
  count?: { used: number; max: number };
}

/** Error (or hint) under a field, plus an optional character counter. */
export function FieldFooter({ errorId, error, hint, count }: FieldFooterProps) {
  const message = error ? (
    <p id={errorId} className="mt-1.5 text-xs text-danger">
      {error}
    </p>
  ) : (
    hint && <p className="mt-1.5 text-xs text-text-soft">{hint}</p>
  );
  if (!count) return message || null;
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">{message}</div>
      <p
        className={clsx(
          "mt-1.5 shrink-0 text-xs tabular-nums",
          count.used >= count.max ? "text-warning" : "text-text-soft"
        )}
        aria-live="polite"
      >
        {count.used}/{count.max}
      </p>
    </div>
  );
}
