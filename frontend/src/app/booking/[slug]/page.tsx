"use client";

import { use, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  CalendarCheck,
  Check,
  Copy,
  MapPin,
  MessageCircle,
  ArrowLeft,
  CalendarPlus,
  Zap,
  Clock,
} from "lucide-react";
import { addDays, format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { publicApi } from "@/lib/public-api";
import { apiError } from "@/lib/api";
import { formatPrice } from "@/lib/utils";
import type { PaymentMethod, PublicTenant } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function PublicBookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [serviceId, setServiceId] = useState<number | null>(null);
  const [resourceId, setResourceId] = useState<number | null>(null);
  const [day, setDay] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [slot, setSlot] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [packageIds, setPackageIds] = useState<number[]>([]);
  const [done, setDone] = useState(false);
  const [manageCode, setManageCode] = useState<string | null>(null);
  const [view, setView] = useState<"home" | "booking">("home");

  const { data: tenant, isLoading, isError } = useQuery<PublicTenant>({
    queryKey: ["public-tenant", slug],
    queryFn: async () => (await publicApi.get<PublicTenant>(`/public/${slug}`)).data,
  });

  const events = tenant?.booking_mode === "events";

  const { data: avail } = useQuery<{ slots: string[]; ends?: string[] }>({
    queryKey: ["availability", slug, serviceId, resourceId, day, events],
    queryFn: async () =>
      (
        await publicApi.get(`/public/${slug}/availability`, {
          params: { resource_id: resourceId, day, ...(serviceId ? { service_id: serviceId } : {}) },
        })
      ).data,
    enabled: !!resourceId && !!day && (events || !!serviceId),
  });

  const book = useMutation({
    mutationFn: async (method: PaymentMethod | null) =>
      (
        await publicApi.post(`/public/${slug}/booking`, {
          service_id: events ? null : serviceId,
          resource_id: resourceId,
          client_name: name,
          client_phone: phone || null,
          start_datetime: slot,
          payment_method: method,
          package_ids: packageIds,
        })
      ).data,
    onSuccess: (data: { public_code: string }) => {
      setManageCode(data.public_code);
      setDone(true);
      toast.success("¡Reserva confirmada!");
    },
    onError: (e) => toast.error(apiError(e)),
  });

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center">Cargando...</div>;
  }
  if (isError || !tenant) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Negocio no encontrado.
      </div>
    );
  }

  const brandStyle = { "--brand": tenant.brand_color } as React.CSSProperties;
  const isEvents = tenant.booking_mode === "events";
  // WhatsApp deep link: digits only; local numbers starting with 0 get the +595 (PY) code.
  const waDigits = (tenant.whatsapp || "").replace(/\D/g, "");
  const waNumber = waDigits.startsWith("0") ? `595${waDigits.slice(1)}` : waDigits;
  const waUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent(
    `Hola ${tenant.name}, quiero hacer una consulta.`
  )}`;
  // Business hours: server computes is_open_now/closes_at in the tenant timezone.
  const DAY_NAMES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
  const hasHours = tenant.weekly_hours?.some((d) => d.ranges.length > 0) ?? false;
  const todayDow = (new Date().getDay() + 6) % 7; // JS Sunday=0 → Monday=0
  const service = tenant.services.find((s) => s.id === serviceId);
  // If the service maps specific resources, only offer those.
  const allowedResources =
    service && service.resource_ids.length > 0
      ? tenant.resources.filter((r) => service.resource_ids.includes(r.id))
      : tenant.resources;

  // Payment resolution
  const both = tenant.accept_cash && tenant.accept_transfer;
  const forced: PaymentMethod | null = both
    ? null
    : tenant.accept_transfer
      ? "transfer"
      : tenant.accept_cash
        ? "cash"
        : null;
  const anyPayment = tenant.accept_cash || tenant.accept_transfer;
  const effectiveMethod = paymentMethod ?? forced;

  const selectedPackages = tenant.packages.filter((p) => packageIds.includes(p.id));
  const packagesTotal = selectedPackages.reduce((acc, p) => acc + Number(p.price), 0);
  const price = Number(service?.price ?? 0) + packagesTotal;
  const transferAmount = tenant.deposit_percent > 0 ? (price * tenant.deposit_percent) / 100 : price;

  const step1Done = isEvents ? packageIds.length > 0 : !!serviceId;
  const canConfirm =
    step1Done && resourceId && slot && name && (!anyPayment || !!effectiveMethod);

  const currentStep = !step1Done ? 1 : !resourceId ? 2 : !slot ? 3 : 4;
  const STEPS = isEvents
    ? ["Paquetes", "Lugar", "Horario", "Datos"]
    : ["Servicio", "Recurso", "Horario", "Datos"];

  if (done) {
    const manageUrl =
      typeof window !== "undefined" ? `${window.location.origin}/booking/${slug}/r/${manageCode}` : "";
    const resourceName = tenant.resources.find((r) => r.id === resourceId)?.name;

    // ---- Add to calendar ----
    const startD = slot ? new Date(slot) : null;
    let endD: Date | null = null;
    if (startD) {
      if (service) {
        endD = new Date(startD.getTime() + service.duration_minutes * 60000);
      } else {
        const idx = avail?.slots.indexOf(slot!) ?? -1;
        const e = idx >= 0 ? avail?.ends?.[idx] : null;
        endD = e
          ? new Date(e)
          : new Date(startD.getTime() + (tenant.event_duration_minutes || 60) * 60000);
      }
    }
    const calTitle = service?.name
      ? `${service.name} · ${tenant.name}`
      : `Reserva · ${tenant.name}`;
    const calDetails = `Reserva en ${tenant.name}.${
      manageUrl ? ` Gestioná tu reserva: ${manageUrl}` : ""
    }`;
    const fmtCal = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const gcalUrl =
      startD && endD
        ? `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
            calTitle
          )}&dates=${fmtCal(startD)}/${fmtCal(endD)}&details=${encodeURIComponent(calDetails)}${
            tenant.location_url ? `&location=${encodeURIComponent(tenant.location_url)}` : ""
          }`
        : "";
    const downloadIcs = () => {
      if (!startD || !endD) return;
      const ics = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Reservalo//ES",
        "BEGIN:VEVENT",
        `UID:${manageCode}@reservalo`,
        `DTSTAMP:${fmtCal(new Date())}`,
        `DTSTART:${fmtCal(startD)}`,
        `DTEND:${fmtCal(endD)}`,
        `SUMMARY:${calTitle}`,
        tenant.location_url ? `LOCATION:${tenant.location_url}` : "",
        `DESCRIPTION:${calDetails}`,
        "END:VEVENT",
        "END:VCALENDAR",
      ]
        .filter(Boolean)
        .join("\r\n");
      const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "reserva.ics";
      a.click();
      URL.revokeObjectURL(url);
    };
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4" style={brandStyle}>
        <Card className="w-full max-w-md animate-in fade-in zoom-in-95 duration-300">
          <CardContent className="space-y-6 p-8 text-center">
            <div className="space-y-3">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
                <Check className="h-8 w-8 text-emerald-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold">¡Reserva confirmada!</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Listo {name?.split(" ")[0]}, te esperamos. 🎉
                </p>
              </div>
            </div>

            {/* Resumen del turno */}
            <div className="space-y-2.5 rounded-xl border bg-muted/40 p-4 text-left text-sm">
              {service && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Servicio</span>
                  <span className="font-medium">{service.name}</span>
                </div>
              )}
              {resourceName && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Con</span>
                  <span className="font-medium">{resourceName}</span>
                </div>
              )}
              {slot && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Cuándo</span>
                  <span className="font-medium capitalize">
                    {format(new Date(slot), "EEE d MMM · HH:mm", { locale: es })}
                  </span>
                </div>
              )}
              {selectedPackages.map((p) => (
                <div key={p.id} className="flex items-center justify-between">
                  <span className="text-muted-foreground">+ {p.name}</span>
                  <span className="font-medium">{formatPrice(p.price)}</span>
                </div>
              ))}
              {price > 0 && (
                <div className="flex items-center justify-between border-t pt-2 font-semibold">
                  <span>Total</span>
                  <span>{formatPrice(price)}</span>
                </div>
              )}
            </div>

            {effectiveMethod === "transfer" && tenant.payment_alias && (
              <div className="rounded-xl border border-[var(--brand)]/30 bg-[var(--brand)]/5 p-4 text-left text-sm">
                <p className="font-medium">Para confirmar, transferí:</p>
                <p className="mt-1">
                  {tenant.deposit_percent > 0 ? "Seña" : "Total"}:{" "}
                  <span className="font-semibold">{formatPrice(transferAmount)}</span>
                </p>
                <p>
                  Alias: <span className="font-semibold">{tenant.payment_alias}</span>
                </p>
                {tenant.payment_instructions && (
                  <p className="mt-1 text-muted-foreground">{tenant.payment_instructions}</p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  navigator.clipboard.writeText(manageUrl);
                  toast.success("Enlace copiado");
                }}
              >
                <Copy className="h-4 w-4" /> Copiar enlace de gestión
              </Button>
              <p className="text-xs text-muted-foreground">
                Guardalo para{" "}
                <a href={`/booking/${slug}/r/${manageCode}`} className="text-[var(--brand)] hover:underline">
                  cancelar o reprogramar
                </a>{" "}
                tu turno.
              </p>
            </div>

            {startD && endD && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Agregar al calendario
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <a
                    href={gcalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border bg-background text-sm font-medium transition-colors hover:border-[var(--brand)]"
                  >
                    <CalendarPlus className="h-4 w-4" /> Google
                  </a>
                  <button
                    type="button"
                    onClick={downloadIcs}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border bg-background text-sm font-medium transition-colors hover:border-[var(--brand)]"
                  >
                    <CalendarPlus className="h-4 w-4" /> Apple / Outlook
                  </button>
                </div>
              </div>
            )}

            <Button
              className="w-full bg-[var(--brand)] hover:opacity-90"
              onClick={() => window.location.reload()}
            >
              Hacer otra reserva
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ---- Presentation (link-in-bio) view ----
  if (view === "home") {
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-muted/40 p-4"
        style={brandStyle}
      >
        <div className="w-full max-w-md animate-in fade-in zoom-in-95 duration-300">
          <div className="rounded-3xl border bg-card p-8 text-center shadow-card">
            {tenant.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={tenant.logo_url}
                alt={tenant.name}
                className="mx-auto h-24 w-24 rounded-2xl object-cover shadow-sm"
              />
            ) : (
              <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-2xl bg-[var(--brand)]/10 text-[var(--brand)]">
                <CalendarCheck className="h-12 w-12" />
              </div>
            )}
            <h1 className="mt-5 text-2xl font-bold tracking-tight">{tenant.name}</h1>
            {tenant.description && (
              <p className="mt-1 text-muted-foreground">{tenant.description}</p>
            )}

            {hasHours && (
              <div className="mt-3 flex justify-center">
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
                    tenant.is_open_now
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
                      tenant.is_open_now ? "bg-emerald-500" : "bg-muted-foreground/50"
                    )}
                  />
                  {tenant.is_open_now
                    ? tenant.closes_at
                      ? `Abierto ahora · cierra ${tenant.closes_at}`
                      : "Abierto ahora"
                    : "Cerrado ahora"}
                </span>
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Zap className="h-3.5 w-3.5 text-[var(--brand)]" /> Reserva al instante
              </span>
              <span className="inline-flex items-center gap-1">
                <Check className="h-3.5 w-3.5 text-[var(--brand)]" /> Sin llamadas
              </span>
              <span className="inline-flex items-center gap-1">
                <CalendarCheck className="h-3.5 w-3.5 text-[var(--brand)]" /> Recordatorio
              </span>
            </div>

            <div className="mt-7 space-y-3">
              <button
                onClick={() => setView("booking")}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--brand)] font-semibold text-white shadow-lg transition-transform hover:-translate-y-0.5"
              >
                <CalendarCheck className="h-5 w-5" /> Reservar / Agendar
              </button>
              {tenant.location_url && (
                <a
                  href={tenant.location_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border bg-background font-semibold transition-colors hover:border-[var(--brand)]"
                >
                  <MapPin className="h-5 w-5" /> Ubicación
                </a>
              )}
              {tenant.whatsapp && (
                <a
                  href={waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border bg-background font-semibold transition-colors hover:border-[#25D366] hover:text-[#1ebe57]"
                >
                  <MessageCircle className="h-5 w-5 text-[#25D366]" /> WhatsApp
                </a>
              )}
            </div>

            {tenant.photos.length > 0 && (
              <div className="mt-6 flex gap-2 overflow-x-auto pb-1">
                {tenant.photos.map((url, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={i}
                    src={url}
                    alt=""
                    className="h-28 w-40 shrink-0 rounded-xl border object-cover"
                  />
                ))}
              </div>
            )}

            {hasHours && (
              <details className="mt-4 text-left">
                <summary className="flex cursor-pointer list-none items-center justify-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
                  <Clock className="h-4 w-4" /> Ver horarios
                </summary>
                <div className="mt-3 space-y-1 text-sm">
                  {tenant.weekly_hours.map((d) => (
                    <div
                      key={d.day}
                      className={cn(
                        "flex justify-between",
                        d.day === todayDow && "font-semibold text-foreground"
                      )}
                    >
                      <span>{DAY_NAMES[d.day]}</span>
                      <span className={d.ranges.length ? "" : "text-muted-foreground"}>
                        {d.ranges.length ? d.ranges.join(", ") : "Cerrado"}
                      </span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
          <p className="mt-6 text-center text-xs text-muted-foreground">
            powered by <span className="font-semibold text-foreground">Reservalo</span>
          </p>
        </div>
      </div>
    );
  }

  // ---- Booking flow view ----
  return (
    <div className="min-h-screen bg-muted/40 py-10" style={brandStyle}>
      <div className="mx-auto max-w-2xl space-y-6 px-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setView("home")}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Volver
          </button>
          <span className="font-semibold">{tenant.name}</span>
        </div>

        <div className="flex items-center">
          {STEPS.map((label, i) => {
            const n = i + 1;
            const done = n < currentStep;
            const activeStep = n === currentStep;
            return (
              <div key={label} className="flex flex-1 items-center last:flex-none">
                <div className="flex flex-col items-center gap-1">
                  <div
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                      done || activeStep
                        ? "bg-[var(--brand)] text-white"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {done ? <Check className="h-4 w-4" /> : n}
                  </div>
                  <span
                    className={cn(
                      "hidden text-[11px] sm:block",
                      activeStep ? "font-medium text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {label}
                  </span>
                </div>
                {n < STEPS.length && (
                  <div
                    className={cn(
                      "mx-1 h-0.5 flex-1 sm:mb-4",
                      done ? "bg-[var(--brand)]" : "bg-muted"
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>

        {isEvents ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">1. Elegí tus paquetes</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2">
              {tenant.packages.map((p) => {
                const checked = packageIds.includes(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() =>
                      setPackageIds(
                        checked ? packageIds.filter((id) => id !== p.id) : [...packageIds, p.id]
                      )
                    }
                    className={cn(
                      "flex items-start justify-between gap-2 rounded-lg border p-3 text-left transition hover:-translate-y-0.5 hover:border-[var(--brand)] hover:shadow-sm",
                      checked && "border-[var(--brand)] bg-muted"
                    )}
                  >
                    <span>
                      <span className="font-medium">{p.name}</span>
                      {p.description && (
                        <span className="block text-sm text-muted-foreground">{p.description}</span>
                      )}
                    </span>
                    <span className="shrink-0 font-medium">{formatPrice(p.price)}</span>
                  </button>
                );
              })}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">1. Elegí un servicio</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2">
              {tenant.services.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setServiceId(s.id);
                    setSlot(null);
                  }}
                  className={cn(
                    "rounded-lg border p-3 text-left transition hover:-translate-y-0.5 hover:border-[var(--brand)] hover:shadow-sm",
                    serviceId === s.id && "border-[var(--brand)] bg-muted"
                  )}
                >
                  <p className="font-medium">{s.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {s.duration_minutes} min · {formatPrice(s.price)}
                  </p>
                </button>
              ))}
            </CardContent>
          </Card>
        )}

        {step1Done && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                2. {isEvents ? "Elegí el lugar" : "Elegí un recurso"}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2">
              {allowedResources.map((r) => (
                <button
                  key={r.id}
                  onClick={() => {
                    setResourceId(r.id);
                    setSlot(null);
                  }}
                  className={cn(
                    "rounded-lg border p-3 text-left transition hover:-translate-y-0.5 hover:border-[var(--brand)] hover:shadow-sm",
                    resourceId === r.id && "border-[var(--brand)] bg-muted"
                  )}
                >
                  <p className="font-medium">{r.name}</p>
                  {r.description && (
                    <p className="text-sm text-muted-foreground">{r.description}</p>
                  )}
                </button>
              ))}
            </CardContent>
          </Card>
        )}

        {step1Done && resourceId && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">3. Elegí fecha y hora</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Fecha</Label>
                <Input
                  type="date"
                  value={day}
                  min={format(new Date(), "yyyy-MM-dd")}
                  max={format(addDays(new Date(), 60), "yyyy-MM-dd")}
                  onChange={(e) => {
                    setDay(e.target.value);
                    setSlot(null);
                  }}
                  className="max-w-xs"
                />
              </div>
              {(avail?.slots ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No hay horarios disponibles para este día. Probá con otra fecha.
                </p>
              ) : (
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => setSlot(avail!.slots[0])}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[var(--brand)]/40 bg-[var(--brand)]/5 px-3 py-1.5 text-sm font-medium text-[var(--brand)] transition-colors hover:bg-[var(--brand)]/10"
                  >
                    <Zap className="h-4 w-4" /> Próximo disponible:{" "}
                    {format(new Date(avail!.slots[0]), "HH:mm")}
                  </button>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {avail!.slots.map((s, i) => {
                      const end = avail!.ends?.[i];
                      return (
                        <button
                          key={s}
                          onClick={() => setSlot(s)}
                          className={cn(
                            "rounded-lg border py-2 text-center text-sm tabular-nums transition-colors hover:border-[var(--brand)]",
                            slot === s && "border-[var(--brand)] bg-[var(--brand)] text-white"
                          )}
                        >
                          {format(new Date(s), "HH:mm")}
                          {end ? `–${format(new Date(end), "HH:mm")}` : ""}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {slot && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">4. Tus datos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Nombre</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>Teléfono</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
              </div>

              {!isEvents && tenant.packages.length > 0 && (
                <div className="space-y-2">
                  <Label>Agregá paquetes (opcional)</Label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {tenant.packages.map((p) => {
                      const checked = packageIds.includes(p.id);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() =>
                            setPackageIds(
                              checked
                                ? packageIds.filter((id) => id !== p.id)
                                : [...packageIds, p.id]
                            )
                          }
                          className={cn(
                            "flex items-start justify-between gap-2 rounded-lg border p-3 text-left text-sm transition hover:border-[var(--brand)]",
                            checked && "border-[var(--brand)] bg-muted"
                          )}
                        >
                          <span>
                            <span className="font-medium">{p.name}</span>
                            {p.description && (
                              <span className="block text-muted-foreground">{p.description}</span>
                            )}
                          </span>
                          <span className="shrink-0 font-medium">{formatPrice(p.price)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {anyPayment && (
                <div className="space-y-2">
                  <Label>¿Cómo querés pagar?</Label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {tenant.accept_cash && (
                      <button
                        onClick={() => setPaymentMethod("cash")}
                        className={cn(
                          "rounded-lg border p-3 text-left text-sm transition-colors hover:border-[var(--brand)]",
                          effectiveMethod === "cash" && "border-[var(--brand)] bg-muted"
                        )}
                      >
                        <p className="font-medium">Pago en el local</p>
                        <p className="text-muted-foreground">Pagás al llegar</p>
                      </button>
                    )}
                    {tenant.accept_transfer && (
                      <button
                        onClick={() => setPaymentMethod("transfer")}
                        className={cn(
                          "rounded-lg border p-3 text-left text-sm transition-colors hover:border-[var(--brand)]",
                          effectiveMethod === "transfer" && "border-[var(--brand)] bg-muted"
                        )}
                      >
                        <p className="font-medium">Transferencia</p>
                        <p className="text-muted-foreground">
                          {tenant.deposit_percent > 0
                            ? `Seña ${formatPrice(transferAmount)}`
                            : formatPrice(transferAmount)}
                        </p>
                      </button>
                    )}
                  </div>
                  {effectiveMethod === "transfer" && tenant.payment_alias && (
                    <div className="rounded-lg border bg-muted/50 p-3 text-sm">
                      <p>
                        Alias: <span className="font-semibold">{tenant.payment_alias}</span>
                      </p>
                      {tenant.payment_instructions && (
                        <p className="mt-1 text-muted-foreground">{tenant.payment_instructions}</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-1.5 rounded-lg bg-muted p-3 text-sm">
                <p>
                  <span className="font-medium">{service?.name}</span> el{" "}
                  {format(new Date(slot), "EEEE d 'de' MMMM 'a las' HH:mm", { locale: es })}
                </p>
                {selectedPackages.map((p) => (
                  <div key={p.id} className="flex justify-between text-muted-foreground">
                    <span>+ {p.name}</span>
                    <span>{formatPrice(p.price)}</span>
                  </div>
                ))}
                <div className="flex justify-between border-t pt-1.5 font-semibold">
                  <span>Total</span>
                  <span>{formatPrice(price)}</span>
                </div>
              </div>
              <Button
                className="w-full bg-[var(--brand)] hover:opacity-90"
                disabled={!canConfirm || book.isPending}
                onClick={() => book.mutate(effectiveMethod)}
              >
                {book.isPending ? "Confirmando..." : "Confirmar reserva"}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {tenant.whatsapp && (
        <a
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Consultar por WhatsApp"
          className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg transition-transform hover:scale-105"
        >
          <MessageCircle className="h-7 w-7" />
        </a>
      )}
    </div>
  );
}
