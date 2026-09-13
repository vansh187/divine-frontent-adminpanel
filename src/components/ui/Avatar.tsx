import clsx from "clsx";
import { initials } from "../../lib/format";

export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <div
      className={clsx(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold/15 text-xs font-bold text-gold-dark",
        className
      )}
    >
      {initials(name)}
    </div>
  );
}
