import type { HTMLAttributes } from "react";
import clsx from "clsx";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        "rounded-2xl border border-border bg-surface shadow-[0_1px_2px_rgba(32,26,18,0.04)]",
        className
      )}
      {...props}
    />
  );
}
