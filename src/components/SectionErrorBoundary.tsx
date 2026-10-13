import type { ReactNode } from "react";
import { ErrorBoundary } from "./ErrorBoundary";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";

/** Contains a crash to one card so the rest of the page keeps working. */
export function SectionErrorBoundary({
  title,
  resetKey,
  children,
}: {
  title: string;
  resetKey?: unknown;
  children: ReactNode;
}) {
  return (
    <ErrorBoundary
      resetKey={resetKey}
      fallback={(reset) => (
        <Card className="p-5">
          <h3 className="mb-2 text-sm font-bold text-text">{title}</h3>
          <p className="mb-3 text-sm text-text-muted">This section could not be displayed.</p>
          <Button variant="outline" size="sm" onClick={reset}>
            Try again
          </Button>
        </Card>
      )}
    >
      {children}
    </ErrorBoundary>
  );
}
