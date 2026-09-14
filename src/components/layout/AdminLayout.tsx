import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { ErrorBoundary } from "../ErrorBoundary";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export function AdminLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar open={menuOpen} onNavigate={() => setMenuOpen(false)} />
      {menuOpen && (
        <div
          className="fixed inset-0 z-30 bg-ink/40 lg:hidden"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <div className="flex min-h-screen min-w-0 flex-1 flex-col lg:pl-0">
        <Topbar onMenuClick={() => setMenuOpen((v) => !v)} />
        <main className="min-w-0 flex-1 overflow-x-hidden px-4 py-6 sm:px-8 sm:py-8">
          <ErrorBoundary resetKey={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
