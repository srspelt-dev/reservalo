"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { CalendarClock, CalendarCheck, Users, Scissors, Gift, Check, Circle } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { DashboardStats } from "@/lib/types";
import { useSubscription } from "@/hooks/use-subscription";
import { useTenant } from "@/hooks/use-tenant";
import { PlanUsage } from "@/components/plan-usage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/status-badge";

function Onboarding({ data, isEvents }: { data: DashboardStats; isEvents: boolean }) {
  const offering = isEvents
    ? { done: data.total_packages > 0, label: "Creá tu primer paquete", href: "/packages" }
    : { done: data.total_services > 0, label: "Creá tu primer servicio", href: "/services" };
  const steps = [
    offering,
    {
      done: data.total_resources > 0,
      label: isEvents ? "Agregá tu salón/local" : "Agregá un recurso",
      href: "/resources",
    },
    { done: data.has_schedules, label: "Configurá tus horarios", href: "/schedules" },
    { done: data.has_bookings, label: "Compartí tu link y recibí tu primera reserva", href: "/settings" },
  ];
  if (steps.every((s) => s.done)) return null;
  const completed = steps.filter((s) => s.done).length;

  return (
    <Card className="border-primary/40 bg-primary/5">
      <CardHeader>
        <CardTitle className="text-base">
          Configurá tu negocio ({completed}/{steps.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {steps.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
          >
            {s.done ? (
              <Check className="h-4 w-4 text-green-600" />
            ) : (
              <Circle className="h-4 w-4 text-muted-foreground" />
            )}
            <span className={cn(s.done && "text-muted-foreground line-through")}>{s.label}</span>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

function useCountUp(target: number, duration = 600): number {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setVal(target);
      return;
    }
    let raf = 0;
    let start = 0;
    const tick = (ts: number) => {
      if (!start) start = ts;
      const p = Math.min(1, (ts - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

const ACCENTS: Record<string, string> = {
  primary: "bg-primary/10 text-primary",
  success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  indigo: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
  amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
};

function StatCard({
  title,
  value,
  icon: Icon,
  accent = "primary",
}: {
  title: string;
  value: number;
  icon: React.ElementType;
  accent?: keyof typeof ACCENTS;
}) {
  const display = useCountUp(value);
  return (
    <Card className="transition duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {title}
          </p>
          <div
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
              ACCENTS[accent]
            )}
          >
            <Icon className="h-[18px] w-[18px]" />
          </div>
        </div>
        <p className="mt-3 font-display text-4xl font-bold leading-none tabular-nums text-foreground">
          {display}
        </p>
      </CardContent>
    </Card>
  );
}

function WeekSummary({ week }: { week: DashboardStats["week"] }) {
  const max = Math.max(1, ...week.map((d) => d.count));
  return (
    <Card>
      <CardHeader>
        <CardTitle>Resumen de la semana</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex h-40 items-end justify-between gap-2">
          {week.map((d) => (
            <div key={d.day} className="flex flex-1 flex-col items-center gap-2">
              <span className="text-xs font-medium tabular-nums text-muted-foreground">
                {d.count}
              </span>
              <div className="flex w-full flex-1 items-end">
                <div
                  className="w-full rounded-t-md bg-primary/80 transition-all"
                  style={{ height: `${(d.count / max) * 100}%`, minHeight: d.count ? "6px" : "0" }}
                />
              </div>
              <span className="text-xs capitalize text-muted-foreground">
                {format(new Date(d.day + "T00:00:00"), "EEEEE", { locale: es })}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function RecentActivity({ recent }: { recent: DashboardStats["recent"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Actividad reciente</CardTitle>
      </CardHeader>
      <CardContent>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin actividad todavía.</p>
        ) : (
          <div className="space-y-3">
            {recent.map((b) => (
              <div key={b.id} className="flex items-start gap-3 text-sm">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                <div>
                  <p>
                    Nueva reserva de <span className="font-medium">{b.client_name}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(b.created_at), { addSuffix: true, locale: es })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BookingRow({ b }: { b: DashboardStats["today"][number] }) {
  return (
    <div className="flex items-center justify-between border-b py-2.5 last:border-0">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold uppercase text-primary">
          {b.client_name.charAt(0)}
        </div>
        <div>
          <p className="font-medium leading-tight">{b.client_name}</p>
          <p className="text-sm text-muted-foreground">
            {format(new Date(b.start_datetime), "EEE d MMM, HH:mm", { locale: es })}
          </p>
        </div>
      </div>
      <StatusBadge status={b.status} />
    </div>
  );
}

export default function DashboardPage() {
  const { data, isLoading } = useQuery<DashboardStats>({
    queryKey: ["dashboard"],
    queryFn: async () => (await api.get<DashboardStats>("/dashboard")).data,
  });
  const { data: sub } = useSubscription();
  const { data: tenant } = useTenant();
  const isEvents = tenant?.booking_mode === "events";

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">Dashboard</h1>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {tenant?.name ? `Resumen de ${tenant.name}` : "Resumen de tu negocio"}
          </p>
        </div>
        <Link
          href="/bookings"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90"
        >
          <CalendarCheck className="h-4 w-4" /> Ver reservas
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Reservas hoy" value={data.bookings_today} icon={CalendarCheck} accent="primary" />
        <StatCard title="Esta semana" value={data.bookings_week} icon={CalendarClock} accent="success" />
        <StatCard title="Clientes" value={data.total_clients} icon={Users} accent="indigo" />
        {isEvents ? (
          <StatCard title="Paquetes" value={data.total_packages} icon={Gift} accent="amber" />
        ) : (
          <StatCard title="Servicios" value={data.total_services} icon={Scissors} accent="amber" />
        )}
      </div>

      <Onboarding data={data} isEvents={isEvents} />

      {sub && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Uso del Plan · {sub.plan.name}</CardTitle>
            <Link href="/subscription" className="text-sm font-medium text-primary hover:underline">
              Ver plan
            </Link>
          </CardHeader>
          <CardContent>
            <PlanUsage sub={sub} />
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Reservas de hoy</CardTitle>
          </CardHeader>
          <CardContent>
            {data.today.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay reservas para hoy.</p>
            ) : (
              data.today.map((b) => <BookingRow key={b.id} b={b} />)
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Próximas reservas</CardTitle>
          </CardHeader>
          <CardContent>
            {data.upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay próximas reservas.</p>
            ) : (
              data.upcoming.map((b) => <BookingRow key={b.id} b={b} />)
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <WeekSummary week={data.week} />
        <RecentActivity recent={data.recent} />
      </div>
    </div>
  );
}
