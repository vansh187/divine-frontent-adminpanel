import type { SVGProps } from "react";

const base: SVGProps<SVGSVGElement> = {
  fill: "none",
  viewBox: "0 0 24 24",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export const IconDashboard = (props: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...props}>
    <rect x="3" y="3" width="7" height="9" rx="1.5" />
    <rect x="14" y="3" width="7" height="5" rx="1.5" />
    <rect x="14" y="12" width="7" height="9" rx="1.5" />
    <rect x="3" y="16" width="7" height="5" rx="1.5" />
  </svg>
);

export const IconCustomers = (props: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...props}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 20c0-3.3 2.9-5.5 5.5-5.5s5.5 2.2 5.5 5.5" />
    <circle cx="17.5" cy="8.5" r="2.4" />
    <path d="M15.8 14.7c2.1.3 4.7 2 4.7 5.3" />
  </svg>
);

export const IconBrokers = (props: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...props}>
    <path d="M3 21V9l9-6 9 6v12" />
    <path d="M9 21v-6h6v6" />
    <path d="M3 9l9 6 9-6" />
  </svg>
);

export const IconVisits = (props: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...props}>
    <path d="M12 21s-7-5.2-7-11a7 7 0 1114 0c0 5.8-7 11-7 11z" />
    <circle cx="12" cy="10" r="2.4" />
  </svg>
);

export const IconBookings = (props: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...props}>
    <rect x="4" y="4" width="16" height="17" rx="2" />
    <path d="M8 2.5v3M16 2.5v3M4 9.5h16" />
    <path d="M8.5 14l2.2 2.2L15.5 12" />
  </svg>
);

export const IconRefunds = (props: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...props}>
    <path d="M3 10a9 9 0 1 1 2.6 6.4" />
    <path d="M3 4v6h6" />
    <path d="M12 8v4l2.6 2.6" />
  </svg>
);

export const IconRevenue = (props: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...props}>
    <path d="M3 20h18" />
    <path d="M6 20V11M12 20V6M18 20v-8" />
  </svg>
);

export const IconSettlements = (props: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...props}>
    <rect x="2.5" y="6" width="19" height="13" rx="2" />
    <path d="M2.5 10.5h19" />
    <path d="M6 14.5h4" />
  </svg>
);

export const IconAudit = (props: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...props}>
    <path d="M7 3h8l4 4v14H7z" />
    <path d="M15 3v4h4" />
    <path d="M9.5 12h5M9.5 15.5h5M9.5 8.5h2" />
  </svg>
);

export const IconHelp = (props: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9.3a2.6 2.6 0 015 .9c0 1.7-2.5 1.9-2.5 3.6" />
    <path d="M12 17.2v.1" />
  </svg>
);

export const IconLogout = (props: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...props}>
    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
    <path d="M16 17l5-5-5-5" />
    <path d="M21 12H9" />
  </svg>
);

export const IconBell = (props: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...props}>
    <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.7 21a2 2 0 01-3.4 0" />
  </svg>
);

export const IconMenu = (props: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...props}>
    <path d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);

export const IconUser = (props: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...props}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20c0-4.2 3.6-7 8-7s8 2.8 8 7" />
  </svg>
);

export const IconCamera = (props: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...props}>
    <path d="M4 8h3l1.6-2.4A2 2 0 0110.3 4.6h3.4a2 2 0 011.7 1L17 8h3a1.5 1.5 0 011.5 1.5v9A1.5 1.5 0 0120 20H4a1.5 1.5 0 01-1.5-1.5v-9A1.5 1.5 0 014 8z" />
    <circle cx="12" cy="14" r="3.4" />
  </svg>
);

export const IconTrash = (props: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...props}>
    <path d="M4 7h16" />
    <path d="M9 7V4.5A1.5 1.5 0 0110.5 3h3A1.5 1.5 0 0115 4.5V7" />
    <path d="M6 7l1 13a1.5 1.5 0 001.5 1.4h7A1.5 1.5 0 0017 20l1-13" />
    <path d="M10 11v6M14 11v6" />
  </svg>
);
