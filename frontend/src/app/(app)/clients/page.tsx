"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { api } from "@/lib/api";
import type { Booking, ClientSummary } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/empty-state";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function ClientsPage() {
  const [selected, setSelected] = useState<ClientSummary | null>(null);

  const [q, setQ] = useState("");
  const { data: allClients = [], isLoading } = useQuery<ClientSummary[]>({
    queryKey: ["clients"],
    queryFn: async () => (await api.get<ClientSummary[]>("/clients")).data,
  });
  const term = q.trim().toLowerCase();
  const clients = term
    ? allClients.filter((c) =>
        [c.name, c.email, c.phone].some((v) => v?.toLowerCase().includes(term))
      )
    : allClients;

  const { data: history = [] } = useQuery<Booking[]>({
    queryKey: ["client-history", selected?.key],
    queryFn: async () =>
      (await api.get<Booking[]>("/clients/history", { params: { key: selected!.key } })).data,
    enabled: !!selected,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight">Clientes</h1>
        <Input
          placeholder="Buscar nombre, email o teléfono..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-64 max-w-full"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Contacto</TableHead>
                <TableHead>Reservas</TableHead>
                <TableHead>Última visita</TableHead>
                <TableHead className="w-24 text-right">Historial</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableSkeleton cols={5} />
              ) : clients.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5}>
                    <EmptyState
                      icon={History}
                      title="Todavía no hay clientes"
                      description="Cuando recibas reservas, tus clientes y su historial aparecerán acá."
                    />
                  </TableCell>
                </TableRow>
              ) : (
                clients.map((c) => (
                  <TableRow key={c.key}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {c.email || c.phone || "—"}
                    </TableCell>
                    <TableCell>{c.total_bookings}</TableCell>
                    <TableCell>
                      {c.last_visit
                        ? format(new Date(c.last_visit), "d MMM yyyy", { locale: es })
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => setSelected(c)}>
                        <History className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Historial de {selected?.name}</DialogTitle>
          </DialogHeader>
          <div className="max-h-96 space-y-2 overflow-y-auto">
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin reservas.</p>
            ) : (
              history.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                >
                  <span>
                    {format(new Date(b.start_datetime), "d MMM yyyy, HH:mm", { locale: es })}
                  </span>
                  <StatusBadge status={b.status} />
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
