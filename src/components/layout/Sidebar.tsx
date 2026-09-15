import { NavLink, useNavigate } from "react-router-dom";
import clsx from "clsx";
import { useAuth } from "../../lib/auth";
import {
  IconAudit,
  IconBookings,
  IconBrokers,
  IconCustomers,
  IconDashboard,
  IconHelp,
  IconLogout,
  IconRefunds,
  IconRevenue,
  IconSettlements,
  IconUser,
  IconVisits,
} from "./icons";

const NAV_ITEMS = [
  { to: "/admin", label: "Dashboard", icon: IconDashboard, end: true },
  { to: "/admin/customers", label: "Customers", icon: IconCustomers },
  { to: "/admin/brokers", label: "Channel Partners", icon: IconBrokers },
  { to: "/admin/site-visits", label: "Site Visits", icon: IconVisits },
  { to: "/admin/bookings", label: "Bookings", icon: IconBookings },
  { to: "/admin/refunds", label: "Refunds", icon: IconRefunds },
  { to: "/admin/revenue", label: "Revenue", icon: IconRevenue },
  { to: "/admin/broker-settlements", label: "Channel Partner Settlements", icon: IconSettlements },
  { to: "/admin/audit", label: "Audit Logs", icon: IconAudit },
  { to: "/admin/profile", label: "My Profile", icon: IconUser },
];

export function Sidebar({ open, onNavigate }: { open: boolean; onNavigate?: () => void }) {
  const { logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    onNavigate?.();
    navigate("/admin/login");
  }

  return (
    <aside
      className={clsx(
        "fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-sidebar text-white transition-transform duration-200 lg:static lg:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full"
      )}
    >
      <div className="flex items-center gap-3 px-6 py-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold/20 text-gold-light">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.7}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 21V10.5L12 4l8 6.5V21" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 21v-6h6v6" />
          </svg>
        </div>
        <div className="leading-tight">
          <p className="text-[13px] font-bold tracking-wide text-gold-light">DIVINE VISION</p>
          <p className="text-[13px] font-bold tracking-wide text-white">INFRA</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              clsx(
                "flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-active text-gold-light"
                  : "text-white/70 hover:bg-sidebar-hover hover:text-white"
              )
            }
          >
            <Icon className="h-[18px] w-[18px] shrink-0" />
            <span className="truncate">{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="space-y-1 border-t border-white/10 px-3 py-4">
        <NavLink
          to="/admin/help"
          className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-white/70 hover:bg-sidebar-hover hover:text-white"
        >
          <IconHelp className="h-[18px] w-[18px]" />
          Help &amp; Support
        </NavLink>
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm font-medium text-white/70 hover:bg-sidebar-hover hover:text-white"
        >
          <IconLogout className="h-[18px] w-[18px]" />
          Log Out
        </button>
      </div>

      <div className="mx-3 mb-4 overflow-hidden rounded-2xl bg-gradient-to-br from-[#3a2c18] to-[#221c14] p-4">
        <p className="text-sm font-semibold text-gold-light">Building Better Tomorrows</p>
        <p className="mt-1 text-xs text-white/50">Divine Vision Infra Admin Panel</p>
      </div>

      <div className="px-6 pb-4">
        <a
          href="https://www.webneststudio.co.in"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-white/40 transition-colors hover:text-gold-light"
        >
          Built by WebNest Studio
        </a>
      </div>
    </aside>
  );
}
