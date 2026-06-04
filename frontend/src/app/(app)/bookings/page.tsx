"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Download, ListChecks, Paperclip, Pencil, Plus, X, MessageCircle } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { api, apiError, API_URL } from "@/lib/api";
import type { Booking, BookingStatus, Package, Resource, Service } from "@/lib/types";
import { cn, formatPrice } from "@/lib/utils";
import { useTenant } from "@/hooks/use-tenant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog, type ConfirmState } from "@/components/confirm-dialog";
import { TableSkeleton } from "@/components/table-skeleton";
import { StatusBadge } from "@/components/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STATUSES: BookingStatus[] = ["pending", "confirmed", "cancelled", "completed"];

export default function BookingsPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<string>("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const PAGE_SIZE = 50;
  const [form, setForm] = useState({
    id: 0,
    service_id: "",
    resource_id: "",
    client_name: "",
    client_phone: "",
    start_datetime: "",
    notes: "",
    status: "confirmed" as BookingStatus,
    package_ids: [] as number[],
  });
  const editing = form.id > 0;
  const { data: tenant } = useTenant();
  const isEvents = tenant?.booking_mode === "events";

  // Opens WhatsApp with a pre-written reminder for the client (PY: local 0… → +595).
  const remindWhatsApp = (b: Booking) => {
    const digits = (b.client_phone || "").replace(/\D/g, "");
    if (!digits) {
      toast.error("Esta reserva no tiene teléfono cargado");
      return;
    }
    const num = digits.startsWith("0") ? `595${digits.slice(1)}` : digits;
    const when = format(new Date(b.start_datetime), "EEEE d 'de' MMMM 'a las' HH:mm", {
      locale: es,
    });
    const msg = `Hola ${b.client_name.split(" ")[0]}, te recordamos tu turno en ${
      tenant?.name ?? ""
    } el ${when}. ¡Te esperamos! 🙌`;
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  const { data: services = [] } = useQuery<Service[]>({
    queryKey: ["services"],
    queryFn: async () => (await api.get<Service[]>("/services")).data,
  });
  const { data: resources = [] } = useQuery<Resource[]>({
    queryKey: ["resources"],
    queryFn: async () => (await api.get<Resource[]>("/resources")).data,
  });
  const { data: packages = [] } = useQuery<Package[]>({
    queryKey: ["packages"],
    queryFn: async () => (await api.get<Package[]>("/packages")).data,
  });
  const { data: bookings = [], isLoading } = useQuery<Booking[]>({
    queryKey: ["bookings", filter, q, page],
    queryFn: async () =>
      (
        await api.get<Booking[]>("/bookings", {
          params: {
            ...(filter === "all" ? {} : { status_filter: filter }),
            ...(q ? { q } : {}),
            limit: PAGE_SIZE,
            offset: page * PAGE_SIZE,
          },
        })
      ).data,
  });

  function downloadCsv() {
    const params = new URLSearchParams();
    if (filter !== "all") params.set("status_filter", filter);
    if (q) params.set("q", q);
    api
      .get(`/bookings/export.csv?${params.toString()}`, { responseType: "blob" })
      .then((res) => {
        const url = URL.createObjectURL(res.data as Blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "reservas.csv";
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch((e) => toast.error(apiError(e)));
  }

  const save = useMutation({
    mutationFn: () => {
      const body = {
        service_id: form.service_id ? Number(form.service_id) : null,
        resource_id: Number(form.resource_id),
        client_name: form.client_name,
        client_phone: form.client_phone || null,
        start_datetime: form.start_datetime,
        notes: form.notes || null,
        package_ids: form.package_ids,
      };
      if (editing) return api.put(`/bookings/${form.id}`, { ...body, status: form.status });
      return api.post("/bookings", body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bookings"] });
      setOpen(false);
      toast.success(editing ? "Reserva actualizada" : "Reserva creada");
    },
    onError: (e) => toast.error(apiError(e)),
  });

  function openNew() {
    setForm({
      id: 0,
      service_id: "",
      resource_id: "",
      client_name: "",
      client_phone: "",
      start_datetime: "",
      notes: "",
      status: "confirmed",
      package_ids: [],
    });
    setOpen(true);
  }

  function openEdit(b: Booking) {
    setForm({
      id: b.id,
      service_id: String(b.service_id),
      resource_id: String(b.resource_id),
      client_name: b.client_name,
      client_phone: b.client_phone ?? "",
      // datetime-local expects local wall-clock; the browser (tenant tz) handles it.
      start_datetime: format(new Date(b.start_datetime), "yyyy-MM-dd'T'HH:mm"),
      notes: b.notes ?? "",
      status: b.status,
      package_ids: b.packages?.map((p) => p.id) ?? [],
    });
    setOpen(true);
  }

  const cancel = useMutation({
    mutationFn: (id: number) => api.delete(`/bookings/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bookings"] });
      toast.success("Reserva cancelada");
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const markPaid = useMutation({
    mutationFn: (id: number) => api.put(`/bookings/${id}`, { payment_status: "paid" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bookings"] });
      toast.success("Marcada como pagada");
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const serviceName = (id: number | null) =>
    id ? (services.find((s) => s.id === id)?.name ?? `#${id}`) : "Evento";
  const resourceName = (id: number) => resources.find((r) => r.id === id)?.name ?? `#${id}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight">Reservas</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Buscar cliente..."
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
            className="w-44"
          />
          <Select
            value={filter}
            onValueChange={(v) => {
              setFilter(v);
              setPage(0);
            }}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={downloadCsv}>
            <Download className="h-4 w-4" /> CSV
          </Button>
          <Button onClick={openNew}>
            <Plus className="h-4 w-4" /> Nueva reserva
          </Button>
        </div>
      </div>

      <Card className="hidden md:block">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Servicio</TableHead>
                <TableHead>Recurso</TableHead>
                <TableHead>Fecha y hora</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Pago</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableSkeleton cols={7} />
              ) : bookings.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7}>
                    <EmptyState
                      icon={ListChecks}
                      title="No hay reservas"
                      description="Las reservas de tus clientes (web pública o cargadas a mano) aparecerán acá."
                      action={
                        <Button onClick={openNew}>
                          <Plus className="h-4 w-4" /> Nueva reserva
                        </Button>
                      }
                    />
                  </TableCell>
                </TableRow>
              ) : (
                bookings.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">{b.client_name}</TableCell>
                    <TableCell>{serviceName(b.service_id)}</TableCell>
                    <TableCell>{resourceName(b.resource_id)}</TableCell>
                    <TableCell>
                      {format(new Date(b.start_datetime), "d MMM yyyy, HH:mm", { locale: es })}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={b.status} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {b.payment_method === "cash"
                            ? "Local"
                            : b.payment_method === "transfer"
                              ? "Transfer."
                              : "—"}
                        </span>
                        <Badge variant={b.payment_status === "paid" ? "success" : "warning"}>
                          {b.payment_status === "paid" ? "Pagado" : "Pendiente"}
                        </Badge>
                        {b.payment_proof_url && (
                          <a
                            href={`${API_URL}${b.payment_proof_url}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Ver comprobante"
                            className="text-primary hover:opacity-70"
                          >
                            <Paperclip className="h-4 w-4" />
                          </a>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {b.payment_status !== "paid" && b.status !== "cancelled" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => markPaid.mutate(b.id)}
                          title="Marcar como pagada"
                        >
                          <Check className="h-4 w-4 text-green-600" />
                        </Button>
                      )}
                      {b.client_phone && b.status !== "cancelled" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Recordar por WhatsApp"
                          title="Recordar por WhatsApp"
                          onClick={() => remindWhatsApp(b)}
                        >
                          <MessageCircle className="h-4 w-4 text-[#25D366]" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(b)}
                        title="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {b.status !== "cancelled" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setConfirm({
                              title: "¿Cancelar esta reserva?",
                              description: `Se cancelará el turno de ${b.client_name}. El horario quedará libre.`,
                              confirmText: "Cancelar reserva",
                              onConfirm: () => cancel.mutate(b.id),
                            })
                          }
                        >
                          <X className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Mobile: cards */}
      <div className="space-y-3 md:hidden">
        {isLoading ? (
          <Skeleton className="h-28 w-full" />
        ) : bookings.length === 0 ? (
          <Card>
            <EmptyState
              icon={ListChecks}
              title="No hay reservas"
              description="Aún no recibiste reservas."
            />
          </Card>
        ) : (
          bookings.map((b) => (
            <Card key={b.id}>
              <CardContent className="space-y-2 p-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{b.client_name}</span>
                  <StatusBadge status={b.status} />
                </div>
                <p className="text-sm text-muted-foreground">
                  {serviceName(b.service_id)} · {resourceName(b.resource_id)}
                </p>
                <p className="text-sm">
                  {format(new Date(b.start_datetime), "d MMM yyyy, HH:mm", { locale: es })}
                </p>
                <div className="flex items-center justify-between pt-1">
                  <Badge variant={b.payment_status === "paid" ? "success" : "warning"}>
                    {b.payment_status === "paid" ? "Pagado" : "Pago pendiente"}
                  </Badge>
                  <div className="flex gap-1">
                    {b.payment_status !== "paid" && b.status !== "cancelled" && (
                      <Button variant="ghost" size="icon" onClick={() => markPaid.mutate(b.id)}>
                        <Check className="h-4 w-4 text-green-600" />
                      </Button>
                    )}
                    {b.client_phone && b.status !== "cancelled" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Recordar por WhatsApp"
                        onClick={() => remindWhatsApp(b)}
                      >
                        <MessageCircle className="h-4 w-4 text-[#25D366]" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => openEdit(b)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {b.status !== "cancelled" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setConfirm({
                            title: "¿Cancelar esta reserva?",
                            description: `Se cancelará el turno de ${b.client_name}.`,
                            confirmText: "Cancelar reserva",
                            onConfirm: () => cancel.mutate(b.id),
                          })
                        }
                      >
                        <X className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Pagination */}
      {(page > 0 || bookings.length === PAGE_SIZE) && (
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            Anterior
          </Button>
          <span className="text-sm text-muted-foreground">Página {page + 1}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={bookings.length < PAGE_SIZE}
            onClick={() => setPage((p) => p + 1)}
          >
            Siguiente
          </Button>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar reserva" : "Nueva reserva"}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            {!isEvents && (
              <div className="space-y-2">
                <Label>Servicio</Label>
                <Select
                  value={form.service_id}
                  onValueChange={(v) => setForm({ ...form, service_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Elegí un servicio" />
                  </SelectTrigger>
                  <SelectContent>
                    {services.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.name} ({s.duration_minutes} min)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>{isEvents ? "Lugar" : "Recurso"}</Label>
              <Select
                value={form.resource_id}
                onValueChange={(v) => setForm({ ...form, resource_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Elegí un recurso" />
                </SelectTrigger>
                <SelectContent>
                  {resources.map((r) => (
                    <SelectItem key={r.id} value={String(r.id)}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Cliente</Label>
                <Input
                  value={form.client_name}
                  onChange={(e) => setForm({ ...form, client_name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Teléfono</Label>
                <Input
                  value={form.client_phone}
                  onChange={(e) => setForm({ ...form, client_phone: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Fecha y hora</Label>
              <Input
                type="datetime-local"
                value={form.start_datetime}
                onChange={(e) => setForm({ ...form, start_datetime: e.target.value })}
                required
              />
            </div>
            {packages.length > 0 && (
              <div className="space-y-2">
                <Label>Paquetes</Label>
                <div className="flex flex-wrap gap-2">
                  {packages.map((p) => {
                    const checked = form.package_ids.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() =>
                          setForm({
                            ...form,
                            package_ids: checked
                              ? form.package_ids.filter((id) => id !== p.id)
                              : [...form.package_ids, p.id],
                          })
                        }
                        className={cn(
                          "rounded-full border px-3 py-1 text-sm transition-colors",
                          checked
                            ? "border-primary bg-primary text-primary-foreground"
                            : "hover:border-primary"
                        )}
                      >
                        {p.name} · {formatPrice(p.price)}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label>Notas</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            {editing && (
              <div className="space-y-2">
                <Label>Estado</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm({ ...form, status: v as BookingStatus })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pendiente</SelectItem>
                    <SelectItem value="confirmed">Confirmada</SelectItem>
                    <SelectItem value="completed">Completada</SelectItem>
                    <SelectItem value="cancelled">Cancelada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <DialogFooter>
              <Button type="submit" loading={save.isPending}>
                {editing ? "Guardar cambios" : "Crear reserva"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}
