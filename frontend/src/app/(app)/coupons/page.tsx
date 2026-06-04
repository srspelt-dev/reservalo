"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2, Ticket } from "lucide-react";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { useCurrentUser } from "@/hooks/use-auth";
import type { Coupon } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog, type ConfirmState } from "@/components/confirm-dialog";
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
  code: string;
  percent: number;
  active: boolean;
}

const EMPTY: Draft = { code: "", percent: 10, active: true };

export default function CouponsPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const { data: me } = useCurrentUser();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  useEffect(() => {
    if (me && me.role !== "owner") router.replace("/dashboard");
  }, [me, router]);

  const { data: coupons = [], isLoading } = useQuery<Coupon[]>({
    queryKey: ["coupons"],
    queryFn: async () => (await api.get<Coupon[]>("/coupons")).data,
    enabled: me?.role === "owner",
  });

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      if (d.id) return api.put(`/coupons/${d.id}`, { percent: d.percent, active: d.active });
      return api.post("/coupons", { code: d.code, percent: d.percent, active: d.active });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["coupons"] });
      setOpen(false);
      toast.success("Cupón guardado");
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/coupons/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["coupons"] });
      toast.success("Cupón eliminado");
    },
    onError: (e) => toast.error(apiError(e)),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">Cupones</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Códigos de descuento que tus clientes aplican al reservar.
          </p>
        </div>
        <Button
          onClick={() => {
            setDraft(EMPTY);
            setOpen(true);
          }}
        >
          <Plus className="h-4 w-4" /> Nuevo cupón
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-6 text-sm text-muted-foreground">Cargando...</p>
          ) : coupons.length === 0 ? (
            <EmptyState
              icon={Ticket}
              title="Todavía no tenés cupones"
              description="Creá un código (ej. PRIMERA10) para tus campañas y promociones."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Descuento</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="w-24 text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {coupons.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono font-medium">{c.code}</TableCell>
                    <TableCell>{c.percent}%</TableCell>
                    <TableCell>
                      <Badge variant={c.active ? "success" : "secondary"}>
                        {c.active ? "Activo" : "Inactivo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Editar"
                        onClick={() => {
                          setDraft({ id: c.id, code: c.code, percent: c.percent, active: c.active });
                          setOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Eliminar"
                        onClick={() =>
                          setConfirm({
                            title: `¿Eliminar el cupón ${c.code}?`,
                            description: "Dejará de funcionar en las reservas nuevas.",
                            confirmText: "Eliminar",
                            onConfirm: () => remove.mutate(c.id),
                          })
                        }
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{draft.id ? "Editar cupón" : "Nuevo cupón"}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate(draft);
            }}
          >
            <div className="space-y-2">
              <Label>Código</Label>
              <Input
                value={draft.code}
                onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })}
                placeholder="PRIMERA10"
                disabled={!!draft.id}
                required
              />
              {draft.id && (
                <p className="text-xs text-muted-foreground">El código no se puede cambiar.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Descuento (%)</Label>
              <Input
                type="number"
                min={1}
                max={100}
                value={draft.percent}
                onChange={(e) => setDraft({ ...draft, percent: Number(e.target.value) })}
                required
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
                className="h-4 w-4"
              />
              Activo
            </label>
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
