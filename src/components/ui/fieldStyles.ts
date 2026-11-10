import clsx from "clsx";

/** Shared look of text inputs and textareas, including the error state. */
export function fieldControlClass(hasError: boolean, className?: string) {
  return clsx(
    "w-full rounded-xl border bg-surface px-3.5 py-2.5 text-sm text-text placeholder:text-text-soft focus:outline-none focus:ring-2",
    hasError ? "border-danger focus:border-danger focus:ring-danger/20" : "border-border focus:border-gold focus:ring-gold/20",
    className
  );
}
