"use client";

import { use, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Check, X, Star } from "lucide-react";
import { addDays, format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { publicApi } from "@/lib/public-api";
import { apiError, API_URL } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { PublicBookingDetail } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";

export default function ManageBookingPage({
  params,
}: {
  params: Promise<{ slug: string; code: string }>;
}) {
  const { slug, code } = use(params);
  const qc = useQueryClient();
  const [rescheduling, setRescheduling] = useState(false);
  const [day, setDay] = useState(format(new Date(), "yyyy-MM-dd"));
  const [slot, setSlot] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");

  const key = ["public-booking", slug, code];

  const { data: booking, isLoading, isError } = useQuery<PublicBookingDetail>({
    queryKey: key,
    queryFn: async () =>
      (await publicApi.get<PublicBookingDetail>(`/public/${slug}/booking/${code}`)).data,
  });

  const { data: avail } = useQuery<{ slots: string[] }>({
    queryKey: ["reschedule-availability", slug, code, day],
    queryFn: async () =>
      (
        await publicApi.get(`/public/${slug}/availability`, {
          params: {
            service_id: booking!.service_id,
            resource_id: booking!.resource_id,
            day,
          },
        })
      ).data,
    enabled: rescheduling && !!booking,
  });

  const cancel = useMutation({
    mutationFn: () => publicApi.post(`/public/${slug}/booking/${code}/cancel`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast.success("Reserva cancelada");
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const reschedule = useMutation({
    mutationFn: () =>
      publicApi.put(`/public/${slug}/booking/${code}/reschedule`, { start_datetime: slot }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      setRescheduling(false);
      setSlot(null);
      toast.success("Reserva reprogramada");
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const review = useMutation({
    mutationFn: () =>
      publicApi.post(`/public/${slug}/booking/${code}/review`, {
        rating,
        comment: comment || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast.success("¡Gracias por tu opinión! ⭐");
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const uploadProof = useMutation({
    mutationFn: (f: File) => {
      const fd = new FormData();
      fd.append("file", f);
      return publicApi.post(`/public/${slug}/booking/${code}/proof`, fd);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast.success("Comprobante subido");
    },
    onError: (e) => toast.error(apiError(e)),
  });

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center">Cargando...</div>;
  }
  if (isError || !booking) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        No encontramos esa reserva.
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-start justify-center bg-muted/40 py-10">
      <div className="w-full max-w-lg space-y-6 px-4">
        <div className="flex items-center gap-3">
          <CalendarClock className="h-7 w-7 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight">{booking.tenant_name}</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              Tu reserva <StatusBadge status={booking.status} />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">Servicio:</span> {booking.service_name}
            </p>
            <p>
              <span className="text-muted-foreground">Recurso:</span> {booking.resource_name}
            </p>
            <p>
              <span className="text-muted-foreground">Cuándo:</span>{" "}
              {format(new Date(booking.start_datetime), "EEEE d 'de' MMMM 'a las' HH:mm", {
                locale: es,
              })}
            </p>
            <p>
              <span className="text-muted-foreground">A nombre de:</span> {booking.client_name}
            </p>
          </CardContent>
        </Card>

        {(booking.payment_method === "transfer" || booking.payment_proof_url) && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                Pago
                <span
                  className={cn(
                    "rounded-md px-2 py-0.5 text-xs font-semibold",
                    booking.payment_status === "paid"
                      ? "bg-green-100 text-green-800"
                      : "bg-amber-100 text-amber-800"
                  )}
                >
                  {booking.payment_status === "paid" ? "Pagado" : "Pago pendiente"}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {booking.payment_alias && (
                <p>
                  Transferí al alias{" "}
                  <span className="font-semibold">{booking.payment_alias}</span>
                </p>
              )}
              {booking.payment_proof_url ? (
                <a
                  href={`${API_URL}${booking.payment_proof_url}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block font-medium text-primary hover:underline"
                >
                  Ver comprobante subido
                </a>
              ) : (
                <p className="text-muted-foreground">Todavía no subiste el comprobante.</p>
              )}
              {booking.payment_status !== "paid" && (
                <div className="space-y-1">
                  <Label>Subir comprobante (imagen o PDF)</Label>
                  <Input
                    type="file"
                    accept="image/*,application/pdf"
                    disabled={uploadProof.isPending}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) uploadProof.mutate(f);
                    }}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {!booking.can_manage ? (
          <p className="text-center text-sm text-muted-foreground">
            Esta reserva ya no se puede modificar.
          </p>
        ) : !rescheduling ? (
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setRescheduling(true)}>
              <CalendarClock className="h-4 w-4" /> Reprogramar
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={() => cancel.mutate()}
              disabled={cancel.isPending}
            >
              <X className="h-4 w-4" /> Cancelar turno
            </Button>
          </div>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Elegí un nuevo horario</CardTitle>
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
              <div className="flex flex-wrap gap-2">
                {(avail?.slots ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin horarios disponibles ese día.</p>
                ) : (
                  avail!.slots.map((s) => (
                    <button
                      key={s}
                      onClick={() => setSlot(s)}
                      className={cn(
                        "rounded-md border px-3 py-1.5 text-sm transition-colors hover:border-primary",
                        slot === s && "border-primary bg-primary text-primary-foreground"
                      )}
                    >
                      {format(new Date(s), "HH:mm")}
                    </button>
                  ))
                )}
              </div>
              <div className="flex gap-3">
                <Button
                  variant="ghost"
                  className="flex-1"
                  onClick={() => {
                    setRescheduling(false);
                    setSlot(null);
                  }}
                >
                  Volver
                </Button>
                <Button
                  className="flex-1"
                  disabled={!slot || reschedule.isPending}
                  onClick={() => reschedule.mutate()}
                >
                  <Check className="h-4 w-4" /> Confirmar cambio
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {booking.reviewed && (
          <p className="text-center text-sm text-muted-foreground">
            ¡Gracias por dejar tu opinión! ⭐
          </p>
        )}

        {booking.can_review && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">¿Cómo estuvo tu experiencia?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-label={`${n} estrellas`}
                    onClick={() => setRating(n)}
                  >
                    <Star
                      className={cn(
                        "h-8 w-8 transition-colors",
                        n <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"
                      )}
                    />
                  </button>
                ))}
              </div>
              <Textarea
                placeholder="Contanos cómo te fue (opcional)"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                maxLength={1000}
              />
              <Button
                className="w-full"
                disabled={rating === 0 || review.isPending}
                onClick={() => review.mutate()}
              >
                Enviar opinión
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
