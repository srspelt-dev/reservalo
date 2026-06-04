"use client";

import Link from "next/link";
import { CalendarCheck } from "lucide-react";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="auth-canvas relative flex min-h-screen items-center justify-center bg-background p-4">
      <main className="w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="mb-8 flex flex-col items-center text-center">
          <Link
            href="/"
            className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20"
          >
            <CalendarCheck className="h-9 w-9" />
          </Link>
          <h1 className="font-display text-3xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        </div>

        <div className="rounded-2xl border border-border bg-card/80 p-6 shadow-sm backdrop-blur">
          {children}
        </div>

        {footer && <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>}
      </main>

      <div className="pointer-events-none fixed bottom-0 left-0 w-full overflow-hidden opacity-20">
        <svg className="h-auto w-full" viewBox="0 0 1440 320" xmlns="http://www.w3.org/2000/svg">
          <path
            fill="hsl(var(--primary))"
            fillOpacity="0.35"
            d="M0,192L48,202.7C96,213,192,235,288,218.7C384,203,480,149,576,149.3C672,149,768,203,864,224C960,245,1056,235,1152,202.7C1248,171,1344,117,1392,90.7L1440,64L1440,320L0,320Z"
          />
        </svg>
      </div>
    </div>
  );
}

export function AuthLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground"
    >
      {children}
    </label>
  );
}
