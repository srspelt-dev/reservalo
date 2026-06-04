"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Pencil, Plus, UserX } from "lucide-react";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { useCurrentUser } from "@/hooks/use-auth";
import type { Resource, Role, User } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Draft {
  id?: number;
  name: string;
  email: string;
  password: string;
  role: Role;
  active: boolean;
  resource_id: number | null;
}

const EMPTY: Draft = {
  name: "",
  email: "",
  password: "",
  role: "staff",
  active: true,
  resource_id: null,
};

export default function UsersPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const { data: me } = useCurrentUser();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  // Only owners manage users.
  useEffect(() => {
    if (me && me.role !== "owner") router.replace("/dashboard");
  }, [me, router]);

  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: ["users"],
    queryFn: async () => (await api.get<User[]>("/users")).data,
    enabled: me?.role === "owner",
  });

  const { data: resources = [] } = useQuery<Resource[]>({
    queryKey: ["resources"],
    queryFn: async () => (await api.get<Resource[]>("/resources")).data,
    enabled: me?.role === "owner",
  });
  const resourceName = (id: number | null) =>
    id ? resources.find((r) => r.id === id)?.name ?? null : null;

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      const resId = d.role === "staff" ? d.resource_id : null;
      if (d.id) {
        const body: Record<string, unknown> = {
          name: d.name,
          role: d.role,
          active: d.active,
          resource_id: resId,
        };
        if (d.password) body.password = d.password;
        return api.put(`/users/${d.id}`, body);
      }
      return api.post("/users", {
        name: d.name,
        email: d.email,
        password: d.password,
        role: d.role,
        resource_id: resId,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      setOpen(false);
      toast.success("Usuario guardado");
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const deactivate = useMutation({
    mutationFn: (id: number) => api.delete(`/users/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      toast.success("Usuario desactivado");
    },
    onError: (e) => toast.error(apiError(e)),
  });

  function openNew() {
    setDraft(EMPTY);
    setOpen(true);
  }
  function openEdit(u: User) {
    setDraft({
      id: u.id,
      name: u.name,
      email: u.email,
      password: "",
      role: u.role,
      active: u.active,
      resource_id: u.resource_id ?? null,
    });
    setOpen(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Usuarios</h1>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4" /> Nuevo usuario
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Recurso</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-24 text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6}>Cargando...</TableCell>
                </TableRow>
              ) : (
                users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">
                      {u.name}
                      {u.id === me?.id && (
                        <span className="ml-2 text-xs text-muted-foreground">(vos)</span>
                      )}
                    </TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell className="capitalize">
                      {u.role === "owner" ? "Dueño" : "Staff"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {u.role === "staff" ? resourceName(u.resource_id) ?? "Todo" : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={u.active ? "success" : "secondary"}>
                        {u.active ? "Activo" : "Inactivo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(u)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {u.active && u.id !== me?.id && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setConfirm({
                              title: `¿Desactivar a ${u.name}?`,
                              description: "No podrá iniciar sesión hasta reactivarlo.",
                              confirmText: "Desactivar",
                              onConfirm: () => deactivate.mutate(u.id),
                            })
                          }
                          title="Desactivar"
                        >
                          <UserX className="h-4 w-4 text-destructive" />
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{draft.id ? "Editar usuario" : "Nuevo usuario"}</DialogTitle>
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
              <Label>Email</Label>
              <Input
                type="email"
                value={draft.email}
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                disabled={!!draft.id}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>{draft.id ? "Nueva contraseña (opcional)" : "Contraseña"}</Label>
              <Input
                type="password"
                minLength={8}
                value={draft.password}
                onChange={(e) => setDraft({ ...draft, password: e.target.value })}
                required={!draft.id}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Rol</Label>
                <Select
                  value={draft.role}
                  onValueChange={(v) => setDraft({ ...draft, role: v as Role })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="staff">Staff</SelectItem>
                    <SelectItem value="owner">Dueño</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {draft.id && (
                <div className="space-y-2">
                  <Label>Estado</Label>
                  <Select
                    value={draft.active ? "active" : "inactive"}
                    onValueChange={(v) => setDraft({ ...draft, active: v === "active" })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Activo</SelectItem>
                      <SelectItem value="inactive">Inactivo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            {draft.role === "staff" && (
              <div className="space-y-2">
                <Label>Recurso asignado</Label>
                <Select
                  value={draft.resource_id ? String(draft.resource_id) : "none"}
                  onValueChange={(v) =>
                    setDraft({ ...draft, resource_id: v === "none" ? null : Number(v) })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin asignar (ve todo)</SelectItem>
                    {resources.map((r) => (
                      <SelectItem key={r.id} value={String(r.id)}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Si asignás un recurso, esta persona solo verá su propio calendario y reservas.
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
