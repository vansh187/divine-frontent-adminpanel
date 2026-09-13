import type { InputHTMLAttributes } from "react";
import { useId } from "react";

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
}

export function TextField({ label, hint, id, ...props }: TextFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <div>
      <label htmlFor={fieldId} className="mb-1.5 block text-sm font-medium text-text">
        {label}
      </label>
      <input
        id={fieldId}
        className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-text placeholder:text-text-soft focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
        {...props}
      />
      {hint && <p className="mt-1.5 text-xs text-text-soft">{hint}</p>}
    </div>
  );
}
