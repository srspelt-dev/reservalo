"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { cn, formatPrice } from "@/lib/utils";
import type { Resource, Service } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog, type ConfirmState } from "@/components/confirm-dialog";
import { TableSkeleton } from "@/components/table-skeleton";
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

interface Draft {
  id?: number;
  name: string;
  description: string;
  duration_minutes: number;
  price: string;
  resource_ids: number[];
}

const EMPTY: Draft = {
  name: "",
  description: "",
  duration_minutes: 30,
  price: "0",
  resource_ids: [],
};

export default function ServicesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  const { data: services = [], isLoading } = useQuery<Service[]>({
    queryKey: ["services"],
    queryFn: async () => (await api.get<Service[]>("/services")).data,
  });
  const { data: resources = [] } = useQuery<Resource[]>({
    queryKey: ["resources"],
    queryFn: async () => (await api.get<Resource[]>("/resources")).data,
  });

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      const payload = {
        name: d.name,
        description: d.description || null,
        duration_minutes: Number(d.duration_minutes),
        price: d.price,
        resource_ids: d.resource_ids,
      };
      if (d.id) return api.put(`/services/${d.id}`, payload);
      return api.post("/services", payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["services"] });
      setOpen(false);
      toast.success("Servicio guardado");
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/services/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["services"] });
      toast.success("Servicio eliminado");
    },
    onError: (e) => toast.error(apiError(e)),
  });

  function openNew() {
    setDraft(EMPTY);
    setOpen(true);
  }
  function openEdit(s: Service) {
    setDraft({
      id: s.id,
      name: s.name,
      description: s.description ?? "",
      duration_minutes: s.duration_minutes,
      price: s.price,
      resource_ids: s.resource_ids ?? [],
    });
    setOpen(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Servicios</h1>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4" /> Nuevo servicio
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Duración</TableHead>
                <TableHead>Precio</TableHead>
                <TableHead className="w-24 text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableSkeleton cols={4} />
              ) : services.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4}>
                    <EmptyState
                      icon={Plus}
                      title="Aún no hay servicios"
                      description="Creá tu primer servicio (ej. Corte, Consulta) con su duración y precio."
                      action={
                        <Button onClick={openNew}>
                          <Plus className="h-4 w-4" /> Nuevo servicio
                        </Button>
                      }
                    />
                  </TableCell>
                </TableRow>
              ) : (
                services.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>{s.duration_minutes} min</TableCell>
                    <TableCell>{formatPrice(s.price)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(s)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setConfirm({
                            title: `¿Eliminar "${s.name}"?`,
                            description:
                              "El servicio dejará de estar disponible. Las reservas existentes se conservan.",
                            confirmText: "Eliminar",
                            onConfirm: () => remove.mutate(s.id),
                          })
                        }
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{draft.id ? "Editar servicio" : "Nuevo servicio"}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate(draft);
            }}
          >
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Descripción</Label>
              <Textarea
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Duración (min)</Label>
                <Input
                  type="number"
                  min={1}
                  value={draft.duration_minutes}
                  onChange={(e) =>
                    setDraft({ ...draft, duration_minutes: Number(e.target.value) })
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Precio</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={draft.price}
                  onChange={(e) => setDraft({ ...draft, price: e.target.value })}
                  required
                />
              </div>
            </div>
            {resources.length > 0 && (
              <div className="space-y-2">
                <Label>Recursos que lo realizan</Label>
                <div className="flex flex-wrap gap-2">
                  {resources.map((r) => {
                    const checked = draft.resource_ids.includes(r.id);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() =>
                          setDraft({
                            ...draft,
                            resource_ids: checked
                              ? draft.resource_ids.filter((id) => id !== r.id)
                              : [...draft.resource_ids, r.id],
                          })
                        }
                        className={cn(
                          "rounded-full border px-3 py-1 text-sm transition-colors",
                          checked
                            ? "border-primary bg-primary text-primary-foreground"
                            : "hover:border-primary"
                        )}
                      >
                        {r.name}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  Vacío = cualquier recurso puede realizarlo.
                </p>
              </div>
            )}
            <DialogFooter>
              <Button type="submit" loading={save.isPending}>
                Guardar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}
