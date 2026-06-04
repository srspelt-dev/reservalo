"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
import { useTenant } from "@/hooks/use-tenant";

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

type NavItem = {
  href: string;
  label: string;
  icon: React.ElementType;
  ownerOnly?: boolean;
  // Visible to staff users (peluqueros, etc.). Omitted = owner-only.
  staff?: boolean;
  feature?: string;
  // Only show this item in the given booking mode. Omitted = show in both.
  mode?: "appointments" | "events";
  // Optional label override when the tenant is in "events" mode.
  eventsLabel?: string;
};

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Principal",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, staff: true },
      { href: "/calendar", label: "Calendario", icon: CalendarDays, staff: true },
      { href: "/bookings", label: "Reservas", icon: ListChecks, staff: true },
    ],
  },
  {
    title: "Catálogo",
    items: [
      { href: "/services", label: "Servicios", icon: Scissors, mode: "appointments" },
      { href: "/packages", label: "Paquetes", icon: Gift, mode: "events" },
      { href: "/resources", label: "Recursos", icon: Boxes, eventsLabel: "Salones" },
      { href: "/schedules", label: "Horarios", icon: Clock },
    ],
  },
  {
    title: "Gestión",
    items: [
      { href: "/clients", label: "Clientes", icon: Contact },
      { href: "/reports", label: "Reportes", icon: BarChart3, ownerOnly: true, feature: "advanced_reports" },
    ],
  },
  {
    title: "Cuenta",
    items: [
      { href: "/users", label: "Usuarios", icon: Users, ownerOnly: true },
      { href: "/subscription", label: "Plan", icon: CreditCard, ownerOnly: true },
      { href: "/settings", label: "Configuración", icon: Settings },
    ],
  },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: user, isLoading } = useRequireAuth();
  const { data: sub } = useSubscription();
  const { data: tenant } = useTenant();
  const features = sub?.features ?? [];
  const mode = tenant?.booking_mode === "events" ? "events" : "appointments";

  const visible = (item: NavItem) =>
    (!item.ownerOnly || user?.role === "owner") &&
    (user?.role !== "staff" || item.staff === true) &&
    (!item.feature || features.includes(item.feature)) &&
    (!item.mode || item.mode === mode);

  const labelFor = (item: NavItem) =>
    mode === "events" && item.eventsLabel ? item.eventsLabel : item.label;

  // Grouped (desktop) and flattened (mobile) views of the filtered nav.
  const groups = NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter(visible) })).filter(
    (g) => g.items.length > 0
  );
  const flatNav = groups.flatMap((g) => g.items);

  // Command palette (Cmd/Ctrl+K) + notifications dropdown
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [bellOpen, setBellOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      } else if (e.key === "Escape") {
        setPaletteOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const paletteResults = flatNav.filter((i) =>
    labelFor(i).toLowerCase().includes(query.trim().toLowerCase())
  );
  const go = (href: string) => {
    router.push(href);
    setPaletteOpen(false);
    setQuery("");
  };

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
        <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-1">
          {groups.map((group) => (
            <div key={group.title} className="space-y-1">
              <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                {group.title}
              </p>
              {group.items.map((item) => {
                const { href, icon: Icon } = item;
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
                    {labelFor(item)}
                  </Link>
                );
              })}
            </div>
          ))}
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
              <Button variant="ghost" size="icon" onClick={logout} aria-label="Cerrar sesión">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </header>
          <nav className="flex gap-1 overflow-x-auto border-b bg-card px-2 py-2">
            {flatNav.map((item) => {
              const { href, icon: Icon } = item;
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
                  {labelFor(item)}
                </Link>
              );
            })}
          </nav>
        </div>
        <header className="sticky top-0 z-30 hidden h-16 items-center justify-between gap-4 border-b bg-card/80 px-6 backdrop-blur md:flex">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="flex h-9 w-full max-w-xs items-center gap-2 rounded-full border bg-surface px-3 text-sm text-muted-foreground transition-colors hover:border-primary/40"
          >
            <Search className="h-4 w-4" />
            <span>Buscar...</span>
            <kbd className="ml-auto rounded border bg-card px-1.5 py-0.5 text-[10px] font-medium">
              ⌘K
            </kbd>
          </button>
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                type="button"
                aria-label="Notificaciones"
                onClick={() => setBellOpen((v) => !v)}
                className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Bell className="h-[18px] w-[18px]" />
              </button>
              {bellOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setBellOpen(false)} />
                  <div className="absolute right-0 z-50 mt-2 w-64 rounded-xl border bg-popover p-4 text-sm shadow-lg">
                    <p className="font-semibold">Notificaciones</p>
                    <p className="mt-1 text-muted-foreground">No tenés notificaciones nuevas.</p>
                  </div>
                </>
              )}
            </div>
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

      {paletteOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[12vh] animate-in fade-in"
          onClick={() => setPaletteOpen(false)}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-2xl border bg-popover shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b px-4">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && paletteResults[0]) go(paletteResults[0].href);
                }}
                placeholder="Buscar páginas del panel..."
                className="h-12 w-full bg-transparent text-sm outline-none"
              />
            </div>
            <div className="max-h-72 overflow-y-auto p-2">
              {paletteResults.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  Nada encontrado.
                </p>
              ) : (
                paletteResults.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.href}
                      onClick={() => go(item.href)}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
                    >
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      {labelFor(item)}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
