import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-bg px-6 text-center">
      <p className="text-5xl font-bold text-gold-dark">404</p>
      <p className="text-text-muted">This page doesn&apos;t exist.</p>
      <Link to="/admin" className="mt-2 text-sm font-semibold text-gold-dark hover:underline">
        Back to dashboard
      </Link>
    </div>
  );
}
