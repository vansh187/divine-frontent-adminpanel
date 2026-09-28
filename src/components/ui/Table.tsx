import { useLayoutEffect, useRef, type ReactNode } from "react";
import clsx from "clsx";

/** Copies each header's text onto its column's cells so the mobile card layout can label them. */
function labelCells(table: HTMLTableElement) {
  const labels = Array.from(table.querySelectorAll("thead th")).map((th) => th.textContent?.trim() ?? "");
  for (const row of table.querySelectorAll("tbody > tr")) {
    Array.from(row.children).forEach((cell, i) => {
      if (cell.hasAttribute("colspan")) return;
      const label = labels[i] ?? "";
      if (cell.getAttribute("data-label") !== label) cell.setAttribute("data-label", label);
    });
  }
}

export function Table({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLTableElement>(null);

  useLayoutEffect(() => {
    const table = ref.current;
    if (!table) return;
    labelCells(table);
    const observer = new MutationObserver(() => labelCells(table));
    observer.observe(table, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="rtable-container">
      <div className="rtable-wrap overflow-x-auto rounded-2xl border border-border bg-surface">
        <table ref={ref} className="rtable w-full min-w-max text-left text-sm">
          {children}
        </table>
      </div>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return (
    <thead>
      <tr className="border-b border-border bg-surface-muted/60">{children}</tr>
    </thead>
  );
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <th className={clsx("px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-muted", className)}>
      {children}
    </th>
  );
}

export function Td({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={clsx("px-4 py-3 align-middle text-text", className)}>{children}</td>;
}

export function Tr({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <tr
      onClick={onClick}
      className={clsx(
        "border-b border-border last:border-0",
        onClick && "cursor-pointer hover:bg-surface-muted/60"
      )}
    >
      {children}
    </tr>
  );
}
