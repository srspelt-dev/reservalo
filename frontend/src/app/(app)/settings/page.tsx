"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { Copy, Plus, Trash2, Download } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { TIMEZONES } from "@/lib/utils";
import type { Tenant } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Form {
  name: string;
  timezone: string;
  description: string;
  logo_url: string;
  brand_color: string;
  whatsapp: string;
  location_url: string;
  photos: string[];
  promo_image_url: string;
  promo_title: string;
  accept_cash: boolean;
  accept_transfer: boolean;
  payment_alias: string;
  payment_instructions: string;
  deposit_percent: number;
  buffer_minutes: number;
  min_advance_minutes: number;
  max_advance_days: number;
  booking_mode: string;
  event_duration_minutes: number;
}

const TABS = [
  { id: "general", label: "General" },
  { id: "brand", label: "Marca" },
  { id: "payments", label: "Pagos" },
  { id: "booking", label: "Reservas" },
] as const;

export default function SettingsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("general");
  const [form, setForm] = useState<Form>({
    name: "",
    timezone: "America/Asuncion",
    description: "",
    logo_url: "",
    brand_color: "#2563eb",
    whatsapp: "",
    location_url: "",
    photos: [],
    promo_image_url: "",
    promo_title: "",
    accept_cash: true,
    accept_transfer: false,
    payment_alias: "",
    payment_instructions: "",
    deposit_percent: 0,
    buffer_minutes: 0,
    min_advance_minutes: 0,
    max_advance_days: 60,
    booking_mode: "appointments",
    event_duration_minutes: 240,
  });

  const { data: tenant } = useQuery<Tenant>({
    queryKey: ["tenant"],
    queryFn: async () => (await api.get<Tenant>("/tenant")).data,
  });

  useEffect(() => {
    if (tenant) {
      setForm({
        name: tenant.name,
        timezone: tenant.timezone,
        description: tenant.description ?? "",
        logo_url: tenant.logo_url ?? "",
        brand_color: tenant.brand_color,
        whatsapp: tenant.whatsapp ?? "",
        location_url: tenant.location_url ?? "",
        photos: tenant.photos ?? [],
        promo_image_url: tenant.promo_image_url ?? "",
        promo_title: tenant.promo_title ?? "",
        accept_cash: tenant.accept_cash,
        accept_transfer: tenant.accept_transfer,
        payment_alias: tenant.payment_alias ?? "",
        payment_instructions: tenant.payment_instructions ?? "",
        deposit_percent: tenant.deposit_percent,
        buffer_minutes: tenant.buffer_minutes,
        min_advance_minutes: tenant.min_advance_minutes,
        max_advance_days: tenant.max_advance_days,
        booking_mode: tenant.booking_mode,
        event_duration_minutes: tenant.event_duration_minutes,
      });
    }
  }, [tenant]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const qrRef = useRef<HTMLCanvasElement>(null);
  const downloadQr = () => {
    const canvas = qrRef.current;
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `reservalo-${tenant?.slug ?? "qr"}.png`;
    a.click();
  };

  const save = useMutation({
    mutationFn: () =>
      api.put("/tenant", {
        ...form,
        description: form.description || null,
        logo_url: form.logo_url || null,
        whatsapp: form.whatsapp || null,
        location_url: form.location_url || null,
        photos: form.photos.map((p) => p.trim()).filter(Boolean),
        promo_image_url: form.promo_image_url || null,
        promo_title: form.promo_title || null,
        payment_alias: form.payment_alias || null,
        payment_instructions: form.payment_instructions || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenant"] });
      toast.success("Configuración guardada");
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const publicUrl =
    tenant && typeof window !== "undefined"
      ? `${window.location.origin}/booking/${tenant.slug}`
      : "";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">
            Configuración
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gestioná los datos, la marca y las reglas de tu negocio.
          </p>
        </div>
        <Button onClick={() => save.mutate()} loading={save.isPending}>
          Guardar cambios
        </Button>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={
              "-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors " +
              (tab === t.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground")
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "general" && (
      <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Negocio</CardTitle>
          <CardDescription>Datos generales de tu cuenta</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Nombre del negocio</Label>
            <Input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              className="max-w-md"
            />
          </div>
          <div className="space-y-2">
            <Label>Zona horaria</Label>
            <Select value={form.timezone} onValueChange={(v) => set("timezone", v)}>
              <SelectTrigger className="max-w-md">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Plan</Label>
            <Input value={tenant?.plan ?? ""} disabled className="max-w-md capitalize" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>URL pública de reservas</CardTitle>
          <CardDescription>Compartí este enlace con tus clientes</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex max-w-xl items-center gap-2">
            <Input readOnly value={publicUrl} />
            <Button
              variant="outline"
              size="icon"
              aria-label="Copiar enlace"
              onClick={() => {
                navigator.clipboard.writeText(publicUrl);
                toast.success("Enlace copiado");
              }}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          {publicUrl && (
            <div className="flex items-center gap-4 rounded-xl border p-4">
              <div className="rounded-lg bg-white p-2">
                <QRCodeCanvas
                  ref={qrRef}
                  value={publicUrl}
                  size={120}
                  marginSize={2}
                  fgColor={form.brand_color || "#2563eb"}
                />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">Código QR</p>
                <p className="text-xs text-muted-foreground">
                  Imprimilo y pegalo en tu local o ponelo en tus flyers. Tus clientes lo escanean y
                  reservan al instante.
                </p>
                <Button type="button" variant="outline" size="sm" onClick={downloadQr}>
                  <Download className="h-4 w-4" /> Descargar QR
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      </div>
      )}

      {tab === "brand" && (
      <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Marca</CardTitle>
          <CardDescription>Personalizá tu página pública de reservas</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Descripción</Label>
            <Textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Ej: Cortes y color en el centro de Asunción."
              className="max-w-xl"
            />
          </div>
          <div className="space-y-2">
            <Label>Logo (URL)</Label>
            <Input
              value={form.logo_url}
              onChange={(e) => set("logo_url", e.target.value)}
              placeholder="https://..."
              className="max-w-xl"
            />
          </div>
          <div className="space-y-2">
            <Label>Color de marca</Label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={form.brand_color}
                onChange={(e) => set("brand_color", e.target.value)}
                className="h-9 w-12 cursor-pointer rounded border"
              />
              <Input
                value={form.brand_color}
                onChange={(e) => set("brand_color", e.target.value)}
                className="w-32"
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>WhatsApp</Label>
              <Input
                value={form.whatsapp}
                onChange={(e) => set("whatsapp", e.target.value)}
                placeholder="Ej: 0981 123 456"
              />
              <p className="text-xs text-muted-foreground">
                Aparece como botón en tu página pública.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Ubicación (link de Google Maps)</Label>
              <Input
                value={form.location_url}
                onChange={(e) => set("location_url", e.target.value)}
                placeholder="https://maps.google.com/..."
              />
              <p className="text-xs text-muted-foreground">Botón "Ubicación" en tu página.</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Fotos del local</Label>
            <p className="text-xs text-muted-foreground">
              Pegá la URL de cada foto (subila a un servicio de imágenes y copiá el link). Se
              muestran en tu página pública. Hasta 12.
            </p>
            <div className="space-y-2">
              {form.photos.map((url, i) => (
                <div key={i} className="flex items-center gap-2">
                  {url.trim() ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={url}
                      alt=""
                      className="h-10 w-10 shrink-0 rounded-md border object-cover"
                    />
                  ) : (
                    <div className="h-10 w-10 shrink-0 rounded-md border bg-muted" />
                  )}
                  <Input
                    value={url}
                    placeholder="https://..."
                    onChange={(e) =>
                      set(
                        "photos",
                        form.photos.map((p, j) => (j === i ? e.target.value : p))
                      )
                    }
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Quitar foto"
                    onClick={() => set("photos", form.photos.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            {form.photos.length < 12 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => set("photos", [...form.photos, ""])}
              >
                <Plus className="h-4 w-4" /> Agregar foto
              </Button>
            )}
            <p className="text-xs text-muted-foreground">
              La primera foto se usa como fondo de tu página pública.
            </p>
          </div>

          <div className="space-y-3 rounded-xl border p-4">
            <div>
              <Label>Promoción (pop-up al entrar)</Label>
              <p className="text-xs text-muted-foreground">
                Si cargás una imagen, al abrir tu link aparece un aviso con esta promo y un botón
                "Aceptar". Dejala vacía para no mostrar nada.
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Título</Label>
              <Input
                value={form.promo_title}
                onChange={(e) => set("promo_title", e.target.value)}
                placeholder="Ej: ¡20% off esta semana!"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Imagen (URL)</Label>
              <Input
                value={form.promo_image_url}
                onChange={(e) => set("promo_image_url", e.target.value)}
                placeholder="https://..."
              />
            </div>
            {form.promo_image_url.trim() && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={form.promo_image_url}
                alt="Vista previa de la promo"
                className="max-h-48 w-full rounded-lg border object-contain"
              />
            )}
          </div>
        </CardContent>
      </Card>
      </div>
      )}

      {tab === "payments" && (
      <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Pagos</CardTitle>
          <CardDescription>Cómo cobran tus clientes al reservar</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.accept_cash}
              onChange={(e) => set("accept_cash", e.target.checked)}
              className="h-4 w-4"
            />
            Aceptar pago en el local
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.accept_transfer}
              onChange={(e) => set("accept_transfer", e.target.checked)}
              className="h-4 w-4"
            />
            Aceptar transferencia / alias
          </label>

          {form.accept_transfer && (
            <div className="space-y-4 rounded-lg border p-4">
              <div className="space-y-2">
                <Label>Alias / billetera / número</Label>
                <Input
                  value={form.payment_alias}
                  onChange={(e) => set("payment_alias", e.target.value)}
                  placeholder="Ej: juan.barber o 0981 123 456"
                  className="max-w-md"
                />
              </div>
              <div className="space-y-2">
                <Label>Instrucciones para el cliente</Label>
                <Textarea
                  value={form.payment_instructions}
                  onChange={(e) => set("payment_instructions", e.target.value)}
                  placeholder="Ej: Transferí y enviá el comprobante por WhatsApp al 0981..."
                  className="max-w-xl"
                />
              </div>
              <div className="space-y-2">
                <Label>Seña requerida (% del precio)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={form.deposit_percent}
                  onChange={(e) => set("deposit_percent", Number(e.target.value))}
                  className="w-32"
                />
                <p className="text-xs text-muted-foreground">
                  0 = sin seña (informás el precio total). Ej: 50 = la mitad por adelantado.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      </div>
      )}

      {tab === "booking" && (
      <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Modo de reserva</CardTitle>
          <CardDescription>Cómo funciona tu negocio</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { v: "appointments", t: "Turnos", d: "Peluquería, consultorio, cancha. El cliente elige un servicio." },
              { v: "events", t: "Eventos", d: "Salón de eventos. El cliente elige paquetes (alquiler + extras)." },
            ].map((o) => (
              <button
                key={o.v}
                type="button"
                onClick={() => set("booking_mode", o.v)}
                className={
                  "rounded-lg border p-4 text-left transition-colors hover:border-primary " +
                  (form.booking_mode === o.v ? "border-primary bg-primary/5" : "")
                }
              >
                <p className="font-medium">{o.t}</p>
                <p className="text-sm text-muted-foreground">{o.d}</p>
              </button>
            ))}
          </div>
          {form.booking_mode === "events" && (
            <div className="space-y-3">
              <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
                Las <span className="font-medium text-foreground">franjas disponibles</span> de tu
                salón se definen en <span className="font-medium text-foreground">Horarios</span>{" "}
                (ej. Sábado 09:00–13:00, 20:00–00:00). Tus clientes eligen una de esas franjas.
              </div>
              <div className="max-w-xs space-y-2">
                <Label>Duración por defecto (min)</Label>
                <Input
                  type="number"
                  min={15}
                  value={form.event_duration_minutes}
                  onChange={(e) => set("event_duration_minutes", Number(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  Solo para reservas que cargás a mano desde el panel.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reglas de reserva</CardTitle>
          <CardDescription>Controlan cómo reservan tus clientes desde la web pública</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Margen entre turnos (min)</Label>
            <Input
              type="number"
              min={0}
              value={form.buffer_minutes}
              onChange={(e) => set("buffer_minutes", Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">Tiempo libre entre una reserva y la siguiente.</p>
          </div>
          <div className="space-y-2">
            <Label>Anticipación mínima (min)</Label>
            <Input
              type="number"
              min={0}
              value={form.min_advance_minutes}
              onChange={(e) => set("min_advance_minutes", Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">No se puede reservar con menos de este tiempo.</p>
          </div>
          <div className="space-y-2">
            <Label>Anticipación máxima (días)</Label>
            <Input
              type="number"
              min={1}
              value={form.max_advance_days}
              onChange={(e) => set("max_advance_days", Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">Hasta cuántos días a futuro se puede reservar.</p>
          </div>
        </CardContent>
      </Card>
      </div>
      )}
    </div>
  );
}
