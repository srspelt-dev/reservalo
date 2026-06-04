"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Gift, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { formatPrice } from "@/lib/utils";
import type { Package } from "@/lib/types";
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
  price: string;
}

const EMPTY: Draft = { name: "", description: "", price: "0" };

export default function PackagesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  const { data: packages = [], isLoading } = useQuery<Package[]>({
    queryKey: ["packages"],
    queryFn: async () => (await api.get<Package[]>("/packages")).data,
  });

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      const payload = { name: d.name, description: d.description || null, price: d.price };
      if (d.id) return api.put(`/packages/${d.id}`, payload);
      return api.post("/packages", payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["packages"] });
      setOpen(false);
      toast.success("Paquete guardado");
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/packages/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["packages"] });
      toast.success("Paquete eliminado");
    },
    onError: (e) => toast.error(apiError(e)),
  });

  function openNew() {
    setDraft(EMPTY);
    setOpen(true);
  }
  function openEdit(p: Package) {
    setDraft({ id: p.id, name: p.name, description: p.description ?? "", price: p.price });
    setOpen(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Paquetes</h1>
          <p className="text-muted-foreground">
            Extras que tus clientes pueden sumar a su reserva (ej. payaso, globo loco).
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4" /> Nuevo paquete
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead>Precio</TableHead>
                <TableHead className="w-24 text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableSkeleton cols={4} />
              ) : packages.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4}>
                    <EmptyState
                      icon={Gift}
                      title="Aún no hay paquetes"
                      description="Creá extras con su precio para que los clientes los sumen a su evento."
                      action={
                        <Button onClick={openNew}>
                          <Plus className="h-4 w-4" /> Nuevo paquete
                        </Button>
                      }
                    />
                  </TableCell>
                </TableRow>
              ) : (
                packages.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-muted-foreground">{p.description}</TableCell>
                    <TableCell>{formatPrice(p.price)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(p)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setConfirm({
                            title: `¿Eliminar "${p.name}"?`,
                            description: "El paquete dejará de ofrecerse en nuevas reservas.",
                            confirmText: "Eliminar",
                            onConfirm: () => remove.mutate(p.id),
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
            <DialogTitle>{draft.id ? "Editar paquete" : "Nuevo paquete"}</DialogTitle>
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
