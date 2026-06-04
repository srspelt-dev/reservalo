"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarCheck,
  CalendarRange,
  Bell,
  Users,
  ArrowRight,
  PlayCircle,
  Check,
} from "lucide-react";
import { ACCESS_KEY } from "@/lib/api";
import { Button } from "@/components/ui/button";

const FEATURES = [
  {
    icon: CalendarRange,
    title: "Agenda inteligente",
    desc: "Disponibilidad por recurso, horarios y franjas. Sin dobles reservas, todo automático.",
  },
  {
    icon: Bell,
    title: "Recordatorios automáticos",
    desc: "Confirmaciones y recordatorios por email para bajar el ausentismo de tus clientes.",
  },
  {
    icon: Users,
    title: "Gestión de clientes",
    desc: "Historial completo, pagos y señas, reportes — para construir relaciones que duran.",
  },
];

const PLANS = [
  { name: "Free", price: "Gs. 0", period: "", popular: false, items: ["1 recurso", "1 servicio", "20 reservas/mes"] },
  { name: "Pro", price: "Gs. 99.000", period: "/mes", popular: false, items: ["3 recursos", "Servicios ilimitados", "Reservas ilimitadas"] },
  { name: "Business", price: "Gs. 199.000", period: "/mes", popular: true, items: ["10 recursos", "Staff ilimitado", "Recordatorios WhatsApp", "Reportes avanzados"] },
  { name: "Enterprise", price: "Gs. 399.000", period: "/mes", popular: false, items: ["Todo ilimitado", "Sucursales", "Marca y API", "Soporte prioritario"] },
];

export default function LandingPage() {
  const [authed, setAuthed] = useState(false);
  useEffect(() => {
    setAuthed(typeof window !== "undefined" && !!localStorage.getItem(ACCESS_KEY));
  }, []);

  const primaryHref = authed ? "/dashboard" : "/login";
  const primaryLabel = authed ? "Ir al panel" : "Ingresar al sistema";

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="fixed top-0 z-50 w-full border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-20 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <CalendarCheck className="h-5 w-5" />
            </div>
            <span className="font-display text-xl font-bold tracking-tight text-primary">Reservalo</span>
          </div>
          <div className="hidden items-center gap-8 md:flex">
            <a href="#features" className="text-sm text-muted-foreground transition-colors hover:text-primary">Funciones</a>
            <a href="#how" className="text-sm text-muted-foreground transition-colors hover:text-primary">Cómo funciona</a>
            <a href="#pricing" className="text-sm text-muted-foreground transition-colors hover:text-primary">Precios</a>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/login">Ingresar</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/register">Crear cuenta</Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden pb-20 pt-40">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-primary/10 to-background" />
        <div className="mx-auto max-w-4xl px-6 text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5">
            <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
            <span className="text-xs font-semibold text-muted-foreground">
              Nuevo: modo Turnos y Eventos
            </span>
          </div>
          <h1 className="font-display text-4xl font-bold leading-tight tracking-tight sm:text-6xl">
            Simplificá tu agenda.
            <br />
            <span className="text-primary">Hacé crecer tu negocio.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            La plataforma de reservas todo-en-uno para profesionales modernos. Automatizá turnos,
            gestioná clientes y escalá sin esfuerzo.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button asChild size="lg" className="shadow-lg shadow-primary/20">
              <Link href={primaryHref}>
                {primaryLabel} <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="ghost" className="text-primary hover:bg-primary/5">
              <a href="#how">
                <PlayCircle className="h-5 w-5" /> Ver cómo funciona
              </a>
            </Button>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Para peluquerías, consultorios, canchas, academias y salones de eventos.
          </p>
        </div>
      </section>

      {/* Dashboard preview */}
      <section className="relative pb-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
            {/* browser header */}
            <div className="flex h-11 items-center gap-1.5 border-b border-border bg-muted px-5">
              <span className="h-3 w-3 rounded-full bg-destructive/30" />
              <span className="h-3 w-3 rounded-full bg-warning/40" />
              <span className="h-3 w-3 rounded-full bg-success/40" />
            </div>
            <div className="grid grid-cols-1 gap-6 p-6 md:grid-cols-4 md:p-10">
              {/* fake sidebar */}
              <div className="hidden flex-col gap-3 md:flex">
                <div className="h-9 w-full rounded-lg bg-primary/10" />
                <div className="h-9 w-3/4 rounded-lg bg-muted" />
                <div className="h-9 w-full rounded-lg bg-muted" />
                <div className="h-9 w-2/3 rounded-lg bg-muted" />
                <div className="h-9 w-3/4 rounded-lg bg-muted" />
              </div>
              {/* fake calendar */}
              <div className="md:col-span-3">
                <div className="mb-5 flex items-center justify-between">
                  <div className="font-display text-lg font-semibold">Agenda semanal</div>
                  <div className="flex gap-2">
                    <div className="h-8 w-20 rounded-md bg-muted" />
                    <div className="h-8 w-20 rounded-md bg-primary" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-5">
                  {Array.from({ length: 15 }).map((_, i) => {
                    const chips: Record<number, { c: string; t: string }> = {
                      1: { c: "bg-primary/10 text-primary border-l-2 border-primary", t: "09:30 Corte" },
                      4: { c: "bg-secondary text-secondary-foreground", t: "11:00 Consulta" },
                      7: { c: "bg-primary/10 text-primary border-l-2 border-primary", t: "13:00 Evento" },
                      10: { c: "bg-amber-100 text-amber-800", t: "16:00 Cancha" },
                    };
                    const chip = chips[i];
                    return (
                      <div key={i} className="min-h-[64px] bg-card p-1.5">
                        {chip && (
                          <div className={`rounded p-1.5 text-[10px] font-medium ${chip.c}`}>{chip.t}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
          <div className="absolute -right-12 -top-12 -z-10 h-64 w-64 rounded-full bg-primary/5 blur-3xl" />
          <div className="absolute -bottom-12 -left-12 -z-10 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
        </div>
      </section>

      {/* Social proof */}
      <section className="border-y border-border bg-card py-12">
        <div className="mx-auto max-w-6xl px-6 text-center">
          <p className="mb-8 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Usado por barberías, consultorios, canchas y salones de todo el país
          </p>
          <div className="flex flex-wrap items-center justify-center gap-12 opacity-50 grayscale">
            {["LUMINA", "RECOVER.", "ZENITH", "AURA", "VITALITY"].map((n) => (
              <span key={n} className="font-display text-xl font-bold italic">{n}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl px-6 py-24">
        <div className="mb-14 max-w-xl">
          <h2 className="font-display text-3xl font-bold tracking-tight">Pensado para la excelencia</h2>
          <p className="mt-3 text-muted-foreground">
            Todo lo que necesitás para administrar tu tiempo y aumentar tus ingresos, en una sola interfaz.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="group rounded-2xl border border-border bg-card p-8 transition-all hover:shadow-card"
            >
              <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary transition-transform group-hover:scale-110">
                <f.icon className="h-6 w-6" />
              </div>
              <h3 className="font-display text-xl font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-y border-border bg-surface">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <h2 className="text-center font-display text-3xl font-bold tracking-tight">Empezá en 3 pasos</h2>
          <div className="mt-12 grid gap-8 sm:grid-cols-3">
            {[
              { n: 1, t: "Configurá tu negocio", d: "Cargá servicios o paquetes, recursos y horarios en minutos." },
              { n: 2, t: "Compartí tu link", d: "Pasá tu enlace por WhatsApp, Instagram o tu web." },
              { n: 3, t: "Recibí reservas", d: "Gestioná todo desde un panel claro, en cualquier dispositivo." },
            ].map((s) => (
              <div key={s.n} className="text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary font-display text-lg font-bold text-primary-foreground">
                  {s.n}
                </div>
                <h3 className="mt-4 font-display font-semibold">{s.t}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="bg-surface">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <div className="mb-14 text-center">
            <h2 className="font-display text-3xl font-bold tracking-tight">Precios simples y transparentes</h2>
            <p className="mt-3 text-muted-foreground">Elegí el plan según la etapa de tu negocio.</p>
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
            {PLANS.map((p) => (
              <div
                key={p.name}
                className={`relative flex flex-col rounded-2xl border bg-card p-8 ${
                  p.popular ? "border-2 border-primary shadow-xl xl:-translate-y-2" : "border-border"
                }`}
              >
                {p.popular && (
                  <div className="absolute right-8 top-0 -translate-y-1/2 rounded-full bg-primary px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-primary-foreground">
                    Más popular
                  </div>
                )}
                <h4 className="text-sm font-semibold text-muted-foreground">{p.name}</h4>
                <div className="mb-6 mt-2">
                  <span className="font-display text-3xl font-bold">{p.price}</span>
                  <span className="text-sm text-muted-foreground">{p.period}</span>
                </div>
                <ul className="mb-8 flex-1 space-y-3 text-sm">
                  {p.items.map((it) => (
                    <li key={it} className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-emerald-600" /> {it}
                    </li>
                  ))}
                </ul>
                <Button asChild variant={p.popular ? "default" : "outline"} className="w-full">
                  <Link href="/register">{p.price === "Gs. 0" ? "Empezar gratis" : "Elegir plan"}</Link>
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-5xl px-6 py-20">
        <div className="rounded-2xl bg-primary px-6 py-12 text-center text-primary-foreground shadow-card">
          <h2 className="font-display text-3xl font-bold tracking-tight">Empezá a recibir reservas hoy</h2>
          <p className="mx-auto mt-3 max-w-xl text-primary-foreground/80">
            Creá tu cuenta gratis y tené tu página de reservas funcionando en minutos.
          </p>
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" variant="secondary">
              <Link href="/register">Crear mi negocio gratis</Link>
            </Button>
            <Button asChild size="lg" variant="ghost" className="text-primary-foreground hover:bg-primary-foreground/10">
              <Link href={primaryHref}>{primaryLabel}</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-card">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-6 py-12 md:grid-cols-4">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <CalendarCheck className="h-4 w-4" />
              </div>
              <span className="font-display font-bold text-primary">Reservalo</span>
            </div>
            <p className="mt-3 max-w-xs text-sm text-muted-foreground">
              Reservas online para cualquier negocio. Turnos y eventos en piloto automático.
            </p>
          </div>
          <div>
            <h5 className="text-sm font-semibold text-muted-foreground">Producto</h5>
            <nav className="mt-4 flex flex-col gap-2 text-sm text-muted-foreground">
              <a href="#features" className="hover:text-primary">Funciones</a>
              <a href="#pricing" className="hover:text-primary">Precios</a>
              <Link href="/register" className="hover:text-primary">Crear cuenta</Link>
            </nav>
          </div>
          <div>
            <h5 className="text-sm font-semibold text-muted-foreground">Cuenta</h5>
            <nav className="mt-4 flex flex-col gap-2 text-sm text-muted-foreground">
              <Link href="/login" className="hover:text-primary">Ingresar</Link>
              <Link href="/register" className="hover:text-primary">Registrarse</Link>
            </nav>
          </div>
          <div>
            <h5 className="text-sm font-semibold text-muted-foreground">Legal</h5>
            <nav className="mt-4 flex flex-col gap-2 text-sm text-muted-foreground">
              <a href="#" className="hover:text-primary">Privacidad</a>
              <a href="#" className="hover:text-primary">Términos</a>
            </nav>
          </div>
        </div>
        <div className="border-t border-border py-6 text-center text-sm text-muted-foreground">
          © 2026 Reservalo. Todos los derechos reservados.
        </div>
      </footer>
    </div>
  );
}
