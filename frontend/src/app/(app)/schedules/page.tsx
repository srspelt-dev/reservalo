"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { DAYS_OF_WEEK } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { Resource, Schedule, ScheduleException } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function SchedulesPage() {
  const qc = useQueryClient();
  const [resourceId, setResourceId] = useState<string>("");
  const [day, setDay] = useState("0");
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("18:00");
  // exception form
  const [excDate, setExcDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [excClosed, setExcClosed] = useState(true);
  const [excStart, setExcStart] = useState("09:00");
  const [excEnd, setExcEnd] = useState("13:00");

  const { data: resources = [] } = useQuery<Resource[]>({
    queryKey: ["resources"],
    queryFn: async () => (await api.get<Resource[]>("/resources")).data,
  });

  const { data: schedules = [] } = useQuery<Schedule[]>({
    queryKey: ["schedules", resourceId],
    queryFn: async () =>
      (await api.get<Schedule[]>("/schedules", { params: { resource_id: resourceId } })).data,
    enabled: !!resourceId,
  });

  const add = useMutation({
    mutationFn: () =>
      api.post("/schedules", {
        resource_id: Number(resourceId),
        day_of_week: Number(day),
        start_time: start,
        end_time: end,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedules", resourceId] });
      toast.success("Horario agregado");
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/schedules/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedules", resourceId] });
      toast.success("Horario eliminado");
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const { data: exceptions = [] } = useQuery<ScheduleException[]>({
    queryKey: ["exceptions", resourceId],
    queryFn: async () =>
      (await api.get<ScheduleException[]>("/schedules/exceptions", { params: { resource_id: resourceId } })).data,
    enabled: !!resourceId,
  });

  const addException = useMutation({
    mutationFn: () =>
      api.post("/schedules/exceptions", {
        resource_id: Number(resourceId),
        date: excDate,
        is_closed: excClosed,
        start_time: excClosed ? null : excStart,
        end_time: excClosed ? null : excEnd,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["exceptions", resourceId] });
      toast.success("Excepción agregada");
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const removeException = useMutation({
    mutationFn: (id: number) => api.delete(`/schedules/exceptions/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["exceptions", resourceId] });
      toast.success("Excepción eliminada");
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const byDay = DAYS_OF_WEEK.map((label, idx) => ({
    label,
    idx,
    items: schedules.filter((s) => s.day_of_week === idx),
  }));

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Horarios</h1>

      <Card>
        <CardHeader>
          <CardTitle>Recurso</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={resourceId} onValueChange={setResourceId}>
            <SelectTrigger className="max-w-sm">
              <SelectValue placeholder="Seleccioná un recurso" />
            </SelectTrigger>
            <SelectContent>
              {resources.map((r) => (
                <SelectItem key={r.id} value={String(r.id)}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {resourceId && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Agregar disponibilidad</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                className="flex flex-wrap items-end gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  add.mutate();
                }}
              >
                <div className="space-y-2">
                  <Label>Día</Label>
                  <Select value={day} onValueChange={setDay}>
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DAYS_OF_WEEK.map((d, i) => (
                        <SelectItem key={i} value={String(i)}>
                          {d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Desde</Label>
                  <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Hasta</Label>
                  <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
                </div>
                <Button type="submit" disabled={add.isPending}>
                  <Plus className="h-4 w-4" /> Agregar
                </Button>
              </form>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {byDay.map(({ label, idx, items }) => (
              <Card key={idx}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{label}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {items.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Cerrado</p>
                  ) : (
                    items.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center justify-between rounded-md border px-3 py-1.5 text-sm"
                      >
                        <span>
                          {s.start_time.slice(0, 5)} – {s.end_time.slice(0, 5)}
                        </span>
                        <button
                          onClick={() => remove.mutate(s.id)}
                          className="text-destructive hover:opacity-70"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Excepciones (feriados / vacaciones / cierres)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <form
                className="flex flex-wrap items-end gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  addException.mutate();
                }}
              >
                <div className="space-y-2">
                  <Label>Fecha</Label>
                  <Input
                    type="date"
                    value={excDate}
                    onChange={(e) => setExcDate(e.target.value)}
                    className="w-44"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select
                    value={excClosed ? "closed" : "custom"}
                    onValueChange={(v) => setExcClosed(v === "closed")}
                  >
                    <SelectTrigger className="w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="closed">Cerrado todo el día</SelectItem>
                      <SelectItem value="custom">Horario especial</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {!excClosed && (
                  <>
                    <div className="space-y-2">
                      <Label>Desde</Label>
                      <Input type="time" value={excStart} onChange={(e) => setExcStart(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Hasta</Label>
                      <Input type="time" value={excEnd} onChange={(e) => setExcEnd(e.target.value)} />
                    </div>
                  </>
                )}
                <Button type="submit" disabled={addException.isPending}>
                  <Plus className="h-4 w-4" /> Agregar
                </Button>
              </form>

              <div className="space-y-2">
                {exceptions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin excepciones cargadas.</p>
                ) : (
                  exceptions.map((x) => (
                    <div
                      key={x.id}
                      className="flex items-center justify-between rounded-md border px-3 py-1.5 text-sm"
                    >
                      <span>
                        <span className="font-medium capitalize">
                          {format(new Date(x.date + "T00:00:00"), "EEE d MMM yyyy", { locale: es })}
                        </span>{" "}
                        —{" "}
                        {x.is_closed
                          ? "Cerrado"
                          : `${x.start_time?.slice(0, 5)}–${x.end_time?.slice(0, 5)}`}
                      </span>
                      <button
                        onClick={() => removeException.mutate(x.id)}
                        className="text-destructive hover:opacity-70"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
