import type { SelectHTMLAttributes } from "react";
import clsx from "clsx";

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={clsx(
        "rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-text focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}
