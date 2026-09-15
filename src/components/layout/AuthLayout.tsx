import type { ReactNode } from "react";

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-bg">
      <div className="relative hidden w-[44%] flex-col justify-between overflow-hidden bg-sidebar p-10 text-white lg:flex">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gold/20 text-gold-light">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.7}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 21V10.5L12 4l8 6.5V21" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 21v-6h6v6" />
            </svg>
          </div>
          <div className="leading-tight">
            <p className="text-sm font-bold tracking-wide text-gold-light">DIVINE VISION</p>
            <p className="text-sm font-bold tracking-wide text-white">INFRA</p>
          </div>
        </div>

        <div className="relative z-10">
          <p className="text-4xl font-bold leading-tight text-white">
            People
            <br />
            Plots
            <br />
            <span className="text-gold-light">Possibilities</span>
          </p>
          <p className="mt-4 max-w-sm text-sm text-white/60">
            Together we build a better tomorrow. Manage bookings, KYC and revenue from one
            trusted admin workspace.
          </p>
        </div>

        <p className="relative z-10 text-xs text-white/40">
          © 2026 Divine Vision Infra. All rights reserved.
        </p>

        <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-gold/10" />
        <div className="pointer-events-none absolute -top-16 -left-10 h-56 w-56 rounded-full bg-gold/5" />
      </div>

      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold/15 text-gold-dark">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.7}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 21V10.5L12 4l8 6.5V21" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 21v-6h6v6" />
              </svg>
            </div>
            <p className="text-sm font-bold tracking-wide text-ink">DIVINE VISION INFRA</p>
          </div>

          <h1 className="text-2xl font-bold text-text">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-text-muted">{subtitle}</p>}

          <div className="mt-8">{children}</div>

          {footer && <div className="mt-6 text-center text-sm text-text-muted">{footer}</div>}
        </div>
      </div>
    </div>
  );
}
