import type { ReactNode } from "react";
import clsx from "clsx";
import { Card } from "./Card";

interface StatCardProps {
  label: string;
  value: string | number;
  hint?: string;
  icon?: ReactNode;
  tone?: "default" | "gold";
}

export function StatCard({ label, value, hint, icon, tone = "default" }: StatCardProps) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-text-muted">{label}</p>
          <p className="mt-2 text-2xl font-bold text-text">{value}</p>
          {hint && <p className="mt-1 text-xs text-text-soft">{hint}</p>}
        </div>
        {icon && (
          <div
            className={clsx(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
              tone === "gold" ? "bg-gold text-white" : "bg-surface-muted text-gold-dark"
            )}
          >
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}
