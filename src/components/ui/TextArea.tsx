import type { TextareaHTMLAttributes } from "react";
import { useId } from "react";
import { FieldFooter } from "./FieldFooter";
import { fieldControlClass } from "./fieldStyles";

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  hint?: string;
  error?: string | null;
  /** Show a "used / maxLength" character counter (needs maxLength). */
  showCount?: boolean;
}

export function TextArea({ label, hint, error, id, className, showCount, ...props }: TextAreaProps) {
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
      <textarea
        id={fieldId}
        aria-invalid={!!error}
        aria-describedby={errorId}
        className={fieldControlClass(!!error, className)}
        {...props}
      />
      <FieldFooter errorId={errorId} error={error} hint={hint} count={count} />
    </div>
  );
}
