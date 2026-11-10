import type { InputHTMLAttributes, ReactNode } from "react";
import { useId } from "react";
import clsx from "clsx";
import { FieldFooter } from "./FieldFooter";
import { fieldControlClass } from "./fieldStyles";

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string | null;
  trailingAction?: ReactNode;
  /** Show a "used / maxLength" character counter (needs maxLength). */
  showCount?: boolean;
}

export function TextField({ label, hint, error, id, className, trailingAction, showCount, ...props }: TextFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const errorId = error ? `${fieldId}-error` : undefined;
  const count =
    showCount && typeof props.maxLength === "number"
      ? { used: String(props.value ?? "").length, max: props.maxLength }
      : undefined;
  return (
    <div>
      <label htmlFor={fieldId} className="mb-1.5 block text-sm font-medium text-text">
        {label}
      </label>
      <div className="relative">
        <input
          id={fieldId}
          aria-invalid={!!error}
          aria-describedby={errorId}
          className={fieldControlClass(!!error, clsx(trailingAction && "pr-11", className))}
          {...props}
        />
        {trailingAction && (
          <div className="absolute inset-y-0 right-2 flex items-center">{trailingAction}</div>
        )}
      </div>
      <FieldFooter errorId={errorId} error={error} hint={hint} count={count} />
    </div>
  );
}
