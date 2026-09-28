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
    <div className="flex min-h-dvh bg-bg">
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

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Phones and tablets: compact brand band above the form card. */}
        <div className="relative overflow-hidden bg-sidebar px-6 pb-20 pt-10 text-white sm:px-10 sm:pb-28 sm:pt-16 lg:hidden">
          <div className="relative z-10 mx-auto flex max-w-md flex-col gap-6">
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
            <p className="text-2xl font-bold leading-snug sm:text-3xl">
              People · Plots · <span className="text-gold-light">Possibilities</span>
            </p>
          </div>
          <div className="pointer-events-none absolute -bottom-20 -right-16 h-56 w-56 rounded-full bg-gold/10" />
          <div className="pointer-events-none absolute -left-10 -top-12 h-40 w-40 rounded-full bg-gold/5" />
        </div>

        <div className="-mt-12 flex flex-1 justify-center px-4 pb-10 sm:-mt-20 sm:px-6 lg:mt-0 lg:items-center lg:py-12">
          <div className="relative z-10 h-fit w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-[0_12px_32px_rgba(22,33,46,0.12)] sm:p-8 lg:max-w-sm lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
            <h1 className="text-2xl font-bold text-text">{title}</h1>
            {subtitle && <p className="mt-1.5 text-sm text-text-muted">{subtitle}</p>}

            <div className="mt-6 sm:mt-8">{children}</div>

            {footer && <div className="mt-6 text-center text-sm text-text-muted">{footer}</div>}
          </div>
        </div>

        <p className="pb-6 text-center text-xs text-text-soft lg:hidden">
          © 2026 Divine Vision Infra. All rights reserved.
        </p>
      </div>
    </div>
  );
}
