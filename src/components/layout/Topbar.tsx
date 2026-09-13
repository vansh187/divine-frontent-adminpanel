import { useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { Avatar } from "../ui/Avatar";
import { IconBell, IconMenu } from "./icons";

export function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  const { admin, logout } = useAuth();
  const navigate = useNavigate();
  const displayName = admin?.fullName ?? admin?.email ?? "Admin";

  function handleLogout() {
    logout();
    navigate("/admin/login");
  }
  return (
    <header className="sticky top-0 z-30 flex items-center gap-4 border-b border-border bg-bg/95 px-4 py-4 backdrop-blur sm:px-8">
      <button
        onClick={onMenuClick}
        className="rounded-lg p-2 text-text-muted hover:bg-surface-muted lg:hidden"
        aria-label="Toggle menu"
      >
        <IconMenu className="h-5 w-5" />
      </button>

      <div className="relative hidden flex-1 max-w-md sm:block">
        <svg
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-soft"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
        </svg>
        <input
          type="text"
          placeholder="Search anything..."
          className="w-full rounded-xl border border-border bg-surface py-2.5 pl-9 pr-4 text-sm placeholder:text-text-soft focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
        />
      </div>

      <div className="ml-auto flex items-center gap-3 sm:gap-4">
        <button
          className="relative rounded-full p-2.5 text-text-muted hover:bg-surface-muted"
          aria-label="Notifications"
        >
          <IconBell className="h-5 w-5" />
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-danger" />
        </button>
        <div className="flex items-center gap-2.5 rounded-xl border border-border bg-surface py-1.5 pl-1.5 pr-3">
          <Avatar name={displayName} />
          <div className="hidden text-left leading-tight sm:block">
            <p className="text-sm font-semibold text-text">{displayName}</p>
            <p className="text-xs text-text-muted">{admin?.email}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="rounded-xl bg-gold px-3 py-2 text-sm font-medium text-white hover:bg-gold-dark"
        >
          Log out
        </button>
      </div>
    </header>
  );
}
