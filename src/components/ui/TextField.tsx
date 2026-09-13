import type { InputHTMLAttributes } from "react";
import { useId } from "react";
import clsx from "clsx";

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string | null;
}

export function TextField({ label, hint, error, id, className, ...props }: TextFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const errorId = error ? `${fieldId}-error` : undefined;
  return (
    <div>
      <label htmlFor={fieldId} className="mb-1.5 block text-sm font-medium text-text">
        {label}
      </label>
      <input
        id={fieldId}
        aria-invalid={!!error}
        aria-describedby={errorId}
        className={clsx(
          "w-full rounded-xl border bg-surface px-3.5 py-2.5 text-sm text-text placeholder:text-text-soft focus:outline-none focus:ring-2",
          error
            ? "border-danger focus:border-danger focus:ring-danger/20"
            : "border-border focus:border-gold focus:ring-gold/20",
          className
        )}
        {...props}
      />
      {error ? (
        <p id={errorId} className="mt-1.5 text-xs text-danger">
          {error}
        </p>
      ) : (
        hint && <p className="mt-1.5 text-xs text-text-soft">{hint}</p>
      )}
    </div>
  );
}
