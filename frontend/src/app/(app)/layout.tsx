"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  LayoutDashboard,
  Scissors,
  Boxes,
  Clock,
  ListChecks,
  BarChart3,
  Contact,
  Settings,
  Users,
  LogOut,
  CalendarCheck,
  CreditCard,
  Gift,
  Search,
  Bell,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { useRequireAuth, logout } from "@/hooks/use-auth";
import { useSubscription } from "@/hooks/use-subscription";

function VerifyBanner() {
  async function resend() {
    try {
      await api.post("/auth/resend-verification");
      toast.success("Te enviamos el email de verificación");
    } catch (e) {
      toast.error(apiError(e));
    }
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-amber-50 px-4 py-2 text-sm text-amber-900">
      <span>Verificá tu email para asegurar tu cuenta.</span>
      <button onClick={resend} className="font-medium underline">
        Reenviar email
      </button>
    </div>
  );
}

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/calendar", label: "Calendario", icon: CalendarDays },
  { href: "/bookings", label: "Reservas", icon: ListChecks },
  { href: "/services", label: "Servicios", icon: Scissors },
  { href: "/resources", label: "Recursos", icon: Boxes },
  { href: "/packages", label: "Paquetes", icon: Gift },
  { href: "/schedules", label: "Horarios", icon: Clock },
  { href: "/clients", label: "Clientes", icon: Contact },
  { href: "/reports", label: "Reportes", icon: BarChart3, ownerOnly: true, feature: "advanced_reports" },
  { href: "/users", label: "Usuarios", icon: Users, ownerOnly: true },
  { href: "/subscription", label: "Plan", icon: CreditCard, ownerOnly: true },
  { href: "/settings", label: "Configuración", icon: Settings },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: user, isLoading } = useRequireAuth();
  const { data: sub } = useSubscription();
  const features = sub?.features ?? [];
  const nav = NAV.filter(
    (item) =>
      (!item.ownerOnly || user?.role === "owner") &&
      (!item.feature || features.includes(item.feature))
  );

  if (isLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Cargando...
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-[280px] flex-col border-r bg-card md:flex">
        <div className="flex items-center gap-3 px-5 py-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <CalendarCheck className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <p className="font-display text-lg font-extrabold tracking-tight text-foreground">Reservalo</p>
            <p className="text-xs text-muted-foreground">Panel de gestión</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <Icon className="h-[18px] w-[18px]" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t p-3">
          <div className="mb-2 flex items-center gap-2 px-1">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold uppercase text-primary">
              {user.name.charAt(0)}
            </div>
            <div className="min-w-0 text-xs">
              <p className="truncate font-medium text-foreground">{user.name}</p>
              <p className="truncate text-muted-foreground">{user.email}</p>
            </div>
          </div>
          <ThemeToggle className="w-full justify-start" />
          <Button variant="ghost" className="w-full justify-start" onClick={logout}>
            <LogOut className="h-4 w-4" /> Salir
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="md:hidden">
          <header className="flex h-14 items-center justify-between border-b px-4">
            <span className="text-lg font-bold">Reservalo</span>
            <div className="flex items-center gap-1">
              <ThemeToggle className="px-2" />
              <Button variant="ghost" size="icon" onClick={logout}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </header>
          <nav className="flex gap-1 overflow-x-auto border-b bg-card px-2 py-2">
            {nav.map(({ href, label, icon: Icon }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
        <header className="sticky top-0 z-30 hidden h-16 items-center justify-between gap-4 border-b bg-card/80 px-6 backdrop-blur md:flex">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              placeholder="Buscar..."
              className="h-9 w-full rounded-full border bg-surface pl-9 pr-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              title="Notificaciones"
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Bell className="h-[18px] w-[18px]" />
            </button>
            <div className="h-6 w-px bg-border" />
            <div className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 transition-colors hover:bg-accent">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold uppercase text-primary">
                {user.name.charAt(0)}
              </div>
              <span className="text-sm font-medium text-foreground">{user.name}</span>
            </div>
          </div>
        </header>
        {!user.email_verified && <VerifyBanner />}
        <main className="flex-1 overflow-x-hidden bg-surface p-4 sm:p-6">
          <div key={pathname} className="mx-auto w-full max-w-[1440px] animate-in fade-in duration-200">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
