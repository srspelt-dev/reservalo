"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  CalendarClock,
  CalendarCheck,
  Users,
  Scissors,
  Gift,
  Check,
  Circle,
  Inbox,
  CalendarDays,
  Plus,
  Share2,
  ArrowUpRight,
  ArrowDownRight,
  ArrowRight,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { DashboardStats } from "@/lib/types";
import { useSubscription } from "@/hooks/use-subscription";
import { useTenant } from "@/hooks/use-tenant";
import { useRequireAuth } from "@/hooks/use-auth";
import { PlanUsage } from "@/components/plan-usage";
import { EmptyState } from "@/components/empty-state";
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

function Sparkline({ data }: { data: number[] }) {
  const max = Math.max(1, ...data);
  return (
    <div className="flex h-8 items-end gap-0.5">
      {data.map((v, i) => (
        <div
          key={i}
          className="w-full rounded-sm bg-primary/25"
          style={{ height: `${Math.max(8, (v / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
  accent = "primary",
  delta,
  trend,
}: {
  title: string;
  value: number;
  icon: React.ElementType;
  accent?: keyof typeof ACCENTS;
  delta?: number;
  trend?: number[];
}) {
  const display = useCountUp(value);
  const up = delta != null && delta > 0;
  const down = delta != null && delta < 0;
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
        {delta != null && (
          <p
            className={cn(
              "mt-2 flex items-center gap-1 text-xs font-medium",
              up && "text-emerald-600 dark:text-emerald-400",
              down && "text-destructive",
              !up && !down && "text-muted-foreground"
            )}
          >
            {up && <ArrowUpRight className="h-3.5 w-3.5" />}
            {down && <ArrowDownRight className="h-3.5 w-3.5" />}
            {delta > 0 ? `+${delta}` : delta} vs. semana pasada
          </p>
        )}
        {trend && <div className="mt-3">{<Sparkline data={trend} />}</div>}
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
          <EmptyState compact icon={Inbox} title="Sin actividad todavía" description="Las reservas recientes van a aparecer acá." />
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

function NextBookingCard({ b }: { b: DashboardStats["upcoming"][number] }) {
  const start = new Date(b.start_datetime);
  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/10 to-transparent">
      <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <CalendarClock className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
              Próxima reserva
            </p>
            <p className="font-display text-lg font-bold leading-tight">{b.client_name}</p>
            <p className="text-sm capitalize text-muted-foreground">
              {format(start, "EEEE d 'de' MMMM · HH:mm", { locale: es })}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm font-medium text-primary">
            {formatDistanceToNow(start, { addSuffix: true, locale: es })}
          </p>
          <div className="mt-1 flex justify-end">
            <StatusBadge status={b.status} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TodayTimeline({ today }: { today: DashboardStats["today"] }) {
  return (
    <div>
      {today.map((b, i) => (
        <div key={b.id} className="flex gap-3">
          <div className="flex w-12 shrink-0 flex-col items-center">
            <span className="text-sm font-semibold tabular-nums">
              {format(new Date(b.start_datetime), "HH:mm")}
            </span>
            <span className="mt-1.5 h-2.5 w-2.5 rounded-full border-2 border-primary bg-background" />
            {i < today.length - 1 && <span className="w-px flex-1 bg-border" />}
          </div>
          <div className="flex flex-1 items-center justify-between pb-5">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold uppercase text-primary">
                {b.client_name.charAt(0)}
              </div>
              <div>
                <p className="font-medium leading-tight">{b.client_name}</p>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(b.start_datetime), "HH:mm")}–
                  {format(new Date(b.end_datetime), "HH:mm")}
                </p>
              </div>
            </div>
            <StatusBadge status={b.status} />
          </div>
        </div>
      ))}
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
  const { data: user } = useRequireAuth();
  const isEvents = tenant?.booking_mode === "events";

  const shareLink = () => {
    if (!tenant || typeof window === "undefined") return;
    const url = `${window.location.origin}/booking/${tenant.slug}`;
    navigator.clipboard.writeText(url);
    toast.success("Enlace de reservas copiado");
  };

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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
            Hola {user?.name?.split(" ")[0] ?? ""} 👋
          </h1>
          <p className="mt-1 text-sm capitalize text-muted-foreground">
            {format(new Date(), "EEEE d 'de' MMMM", { locale: es })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={shareLink}
            className="inline-flex items-center justify-center gap-2 rounded-xl border bg-background px-3 py-2 text-sm font-semibold transition hover:bg-accent"
          >
            <Share2 className="h-4 w-4" /> Compartir link
          </button>
          <Link
            href="/calendar"
            className="inline-flex items-center justify-center gap-2 rounded-xl border bg-background px-3 py-2 text-sm font-semibold transition hover:bg-accent"
          >
            <CalendarDays className="h-4 w-4" /> Calendario
          </Link>
          <Link
            href="/bookings"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Nueva reserva
          </Link>
        </div>
      </div>

      {data.upcoming.length > 0 && <NextBookingCard b={data.upcoming[0]} />}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Reservas hoy" value={data.bookings_today} icon={CalendarCheck} accent="primary" />
        <StatCard
          title="Esta semana"
          value={data.bookings_week}
          icon={CalendarClock}
          accent="success"
          delta={data.bookings_week - data.bookings_week_prev}
          trend={data.week.map((d) => d.count)}
        />
        <StatCard title="Clientes" value={data.total_clients} icon={Users} accent="indigo" />
        {isEvents ? (
          <StatCard title="Paquetes" value={data.total_packages} icon={Gift} accent="amber" />
        ) : (
          <StatCard title="Servicios" value={data.total_services} icon={Scissors} accent="amber" />
        )}
      </div>

      {user?.role === "owner" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Rendimiento de tu link · últimos 7 días</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 divide-x text-center">
              <div className="px-2">
                <p className="font-display text-3xl font-bold tabular-nums">{data.views_week}</p>
                <p className="mt-1 text-xs text-muted-foreground">Visitas</p>
              </div>
              <div className="px-2">
                <p className="font-display text-3xl font-bold tabular-nums">{data.bookings_week}</p>
                <p className="mt-1 text-xs text-muted-foreground">Reservas</p>
              </div>
              <div className="px-2">
                <p className="font-display text-3xl font-bold tabular-nums text-primary">
                  {data.views_week > 0
                    ? `${Math.round((data.bookings_week / data.views_week) * 100)}%`
                    : "—"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Conversión</p>
              </div>
            </div>
            {data.views_week === 0 && (
              <p className="mt-3 text-center text-xs text-muted-foreground">
                Compartí tu link para empezar a ver cuántas visitas se vuelven reservas.
              </p>
            )}
          </CardContent>
        </Card>
      )}

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
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Agenda de hoy</CardTitle>
            <Link
              href="/calendar"
              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              Ver calendario <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardHeader>
          <CardContent>
            {data.today.length === 0 ? (
              <EmptyState compact icon={CalendarCheck} title="No hay reservas para hoy" description="Cuando entre una reserva para hoy, va a aparecer acá." />
            ) : (
              <TodayTimeline today={data.today} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Próximas reservas</CardTitle>
          </CardHeader>
          <CardContent>
            {data.upcoming.length === 0 ? (
              <EmptyState compact icon={CalendarClock} title="No hay próximas reservas" description="Compartí tu link de reservas para empezar a recibir turnos." />
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
