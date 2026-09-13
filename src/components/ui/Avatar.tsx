import clsx from "clsx";
import { useState } from "react";
import { initials } from "../../lib/format";

export function Avatar({
  name,
  src,
  className,
}: {
  name: string;
  src?: string | null;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const [lastSrc, setLastSrc] = useState(src);

  if (src !== lastSrc) {
    setLastSrc(src);
    setFailed(false);
  }

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={name}
        onError={() => setFailed(true)}
        className={clsx("h-9 w-9 shrink-0 rounded-full object-cover", className)}
      />
    );
  }
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
