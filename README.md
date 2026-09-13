# Divine Vision Infra — Admin Panel (Frontend)

React + TypeScript admin panel for Divine Vision Infra, built against the
"Admin Panel Frontend Requirements & Integration HLD v1.1" contract document.

This is currently a **UI-only build**: every screen renders static/mock data
from [`src/lib/mockData.ts`](src/lib/mockData.ts) so the full screen set can
be reviewed before the backend API (`/api/v1`) is available. Domain enums in
[`src/lib/types.ts`](src/lib/types.ts) mirror the HLD's shared enums exactly
so wiring up real data later is a drop-in replacement, not a rewrite.

## Stack

- React 19 + React Router 7
- Tailwind CSS v4
- Recharts for dashboard/analytics charts
- Vite + TypeScript

## Getting started

```bash
npm install
npm run dev
```

## Screens implemented

- Auth: Login, Signup, Forgot Password, Reset Password
- Dashboard: KPI cards, growth/revenue/site-visit charts, booking funnel, schedule
- Customers: list + detail (activity timeline, site visits)
- Brokers: list + detail (performance chart, commission summary)
- Site Visits: unified customer/broker-channel visit list with filters
- Bookings: queue + KYC/payment review detail (approve/reject/cancel flows)
- Refunds: list + detail modal, including cash-refund office-collection messaging
- Revenue: summary cards, trend chart, transaction drill-down
- Broker Settlements (admin): queue + detail with eligible-action-driven workflow (review/approve/hold/reject/mark paid)
- Audit Logs

## Not yet wired

- Live API integration (`/api/v1/...`), JWT/session handling, single-flight
  token refresh, optimistic-concurrency (`expected_version`) enforcement,
  idempotency keys, and error-envelope mapping — all specified in the HLD but
  intentionally deferred until the backend contract is available.
- The broker-facing portal (`/broker/accounts...`) is out of scope for this
  pass, which focuses on the admin panel.
