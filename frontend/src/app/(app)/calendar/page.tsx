"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { es } from "date-fns/locale";
import { api } from "@/lib/api";
import { cn, DAYS_OF_WEEK } from "@/lib/utils";
import type { Booking, Resource, Schedule, Service } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import {
  Dialog,
  DialogContent,
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

type View = "day" | "week" | "month";

function rangeFor(view: View, anchor: Date): { from: Date; to: Date } {
  if (view === "day") return { from: anchor, to: anchor };
  if (view === "week")
    return { from: startOfWeek(anchor, { weekStartsOn: 1 }), to: endOfWeek(anchor, { weekStartsOn: 1 }) };
  return {
    from: startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 }),
    to: endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 }),
  };
}

function fmt(d: Date) {
  return format(d, "yyyy-MM-dd");
}

// date-fns/JS weekday (0=Sunday) -> our schedule weekday (0=Monday).
function ourWeekday(d: Date) {
  return (d.getDay() + 6) % 7;
}

export default function CalendarPage() {
  const [view, setView] = useState<View>("month");
  const [anchor, setAnchor] = useState(new Date());
  const [resourceId, setResourceId] = useState<string>("all");
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const { from, to } = useMemo(() => rangeFor(view, anchor), [view, anchor]);

  const { data: resources = [] } = useQuery<Resource[]>({
    queryKey: ["resources"],
    queryFn: async () => (await api.get<Resource[]>("/resources")).data,
  });
  const { data: services = [] } = useQuery<Service[]>({
    queryKey: ["services"],
    queryFn: async () => (await api.get<Service[]>("/services")).data,
  });
  const resourceName = (id: number) => resources.find((r) => r.id === id)?.name ?? "";
  const serviceName = (id: number) => services.find((s) => s.id === id)?.name ?? "";

  const { data: schedules = [] } = useQuery<Schedule[]>({
    queryKey: ["schedules", resourceId],
    queryFn: async () =>
      (await api.get<Schedule[]>("/schedules", { params: { resource_id: resourceId } })).data,
    enabled: resourceId !== "all",
  });

  const { data: bookings = [] } = useQuery<Booking[]>({
    queryKey: ["calendar", view, fmt(anchor), resourceId],
    queryFn: async () =>
      (
        await api.get<Booking[]>("/bookings", {
          params: {
            date_from: fmt(from),
            date_to: fmt(to),
            ...(resourceId !== "all" ? { resource_id: resourceId } : {}),
          },
        })
      ).data,
  });

  const specificResource = resourceId !== "all";

  // schedules grouped by weekday (0=Mon..6=Sun)
  const scheduleByDay = useMemo(() => {
    const map: Record<number, Schedule[]> = {};
    for (const s of schedules) (map[s.day_of_week] ??= []).push(s);
    for (const k of Object.keys(map))
      map[+k].sort((a, b) => a.start_time.localeCompare(b.start_time));
    return map;
  }, [schedules]);

  const worksOn = (d: Date) => specificResource && (scheduleByDay[ourWeekday(d)]?.length ?? 0) > 0;
  const hoursFor = (d: Date) =>
    (scheduleByDay[ourWeekday(d)] ?? [])
      .map((s) => `${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)}`)
      .join(", ");

  const days = useMemo(() => {
    const out: Date[] = [];
    let d = from;
    while (d <= to) {
      out.push(d);
      d = addDays(d, 1);
    }
    return out;
  }, [from, to]);

  const forDay = (d: Date) =>
    bookings
      .filter((b) => isSameDay(new Date(b.start_datetime), d))
      .sort((a, b) => a.start_datetime.localeCompare(b.start_datetime));

  function move(dir: 1 | -1) {
    if (view === "month") setAnchor(addMonths(anchor, dir));
    else if (view === "week") setAnchor(addDays(anchor, dir * 7));
    else setAnchor(addDays(anchor, dir));
  }

  const title =
    view === "month"
      ? format(anchor, "MMMM yyyy", { locale: es })
      : view === "week"
        ? `${format(from, "d MMM", { locale: es })} – ${format(to, "d MMM", { locale: es })}`
        : format(anchor, "EEEE d 'de' MMMM", { locale: es });

  // working/non-working day summary for the selected resource
  const workingSummary = useMemo(() => {
    if (!specificResource) return null;
    const works: string[] = [];
    const off: string[] = [];
    for (let dow = 0; dow < 7; dow++) {
      if ((scheduleByDay[dow]?.length ?? 0) > 0) {
        const hrs = scheduleByDay[dow].map((s) => `${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)}`).join(", ");
        works.push(`${DAYS_OF_WEEK[dow]} ${hrs}`);
      } else {
        off.push(DAYS_OF_WEEK[dow]);
      }
    }
    return { works, off };
  }, [scheduleByDay, specificResource]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight">Calendario</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={resourceId} onValueChange={setResourceId}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Recurso" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los recursos</SelectItem>
              {resources.map((r) => (
                <SelectItem key={r.id} value={String(r.id)}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(["day", "week", "month"] as View[]).map((v) => (
            <Button
              key={v}
              variant={view === v ? "default" : "outline"}
              size="sm"
              onClick={() => setView(v)}
            >
              {v === "day" ? "Día" : v === "week" ? "Semana" : "Mes"}
            </Button>
          ))}
        </div>
      </div>

      {workingSummary && (
        <Card>
          <CardContent className="space-y-1 p-4 text-sm">
            <p>
              <span className="font-medium text-foreground">Trabaja:</span>{" "}
              {workingSummary.works.length ? (
                <span className="text-muted-foreground">{workingSummary.works.join(" · ")}</span>
              ) : (
                <span className="text-muted-foreground">sin horarios cargados</span>
              )}
            </p>
            {workingSummary.off.length > 0 && (
              <p>
                <span className="font-medium text-foreground">No trabaja:</span>{" "}
                <span className="text-muted-foreground">{workingSummary.off.join(", ")}</span>
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <Button variant="outline" size="icon" onClick={() => move(-1)} aria-label="Anterior">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-lg font-medium capitalize">{title}</span>
        <Button variant="outline" size="icon" onClick={() => move(1)} aria-label="Siguiente">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {view === "month" ? (
        <Card>
          <CardContent className="p-2">
            <div className="grid grid-cols-7 gap-px text-center text-xs font-medium text-muted-foreground">
              {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
                <div key={d} className="py-2">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-px">
              {days.map((d) => {
                const items = forDay(d);
                const closed = specificResource && !worksOn(d);
                return (
                  <button
                    type="button"
                    key={d.toISOString()}
                    onClick={() => setSelectedDay(d)}
                    className={cn(
                      "min-h-24 rounded-md border p-1 text-left transition-colors hover:border-primary",
                      !isSameMonth(d, anchor) && "bg-muted/40 text-muted-foreground",
                      closed && "bg-muted/60",
                      isSameDay(d, new Date()) && "border-primary"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">{format(d, "d")}</span>
                      {closed && (
                        <span className="text-[10px] uppercase text-muted-foreground">cerrado</span>
                      )}
                    </div>
                    {specificResource && !closed && (
                      <div className="text-[10px] text-muted-foreground">{hoursFor(d)}</div>
                    )}
                    <div className="mt-1 space-y-1">
                      {items.slice(0, 3).map((b) => (
                        <div
                          key={b.id}
                          className="truncate rounded bg-primary/10 px-1 py-0.5 text-[11px] text-primary"
                        >
                          {format(new Date(b.start_datetime), "HH:mm")} {b.client_name}
                          {resourceName(b.resource_id) && ` (${resourceName(b.resource_id)})`}
                        </div>
                      ))}
                      {items.length > 3 && (
                        <div className="text-[11px] text-muted-foreground">
                          +{items.length - 3} más
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className={cn("grid gap-4", view === "week" ? "md:grid-cols-2 lg:grid-cols-3" : "")}>
          {days.map((d) => {
            const items = forDay(d);
            const closed = specificResource && !worksOn(d);
            return (
              <Card
                key={d.toISOString()}
                onClick={() => setSelectedDay(d)}
                className={cn("cursor-pointer transition hover:shadow-md", closed && "bg-muted/40")}
              >
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-medium capitalize">
                      {format(d, "EEEE d MMM", { locale: es })}
                    </p>
                    {specificResource &&
                      (closed ? (
                        <span className="text-xs uppercase text-muted-foreground">No trabaja</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">{hoursFor(d)}</span>
                      ))}
                  </div>
                  {items.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {closed ? "Cerrado." : "Sin reservas."}
                    </p>
                  ) : (
                    items.map((b) => (
                      <div
                        key={b.id}
                        className="flex items-center justify-between rounded-md border bg-background px-3 py-2 text-sm"
                      >
                        <span>
                          <span className="font-medium">
                            {format(new Date(b.start_datetime), "HH:mm")}
                          </span>{" "}
                          {b.client_name}
                          {resourceName(b.resource_id) && (
                            <span className="text-muted-foreground">
                              {" "}
                              ({resourceName(b.resource_id)})
                            </span>
                          )}
                        </span>
                        <StatusBadge status={b.status} />
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!selectedDay} onOpenChange={(o) => !o && setSelectedDay(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="capitalize">
              {selectedDay &&
                format(selectedDay, "EEEE d 'de' MMMM yyyy", { locale: es })}
            </DialogTitle>
          </DialogHeader>
          {selectedDay &&
            (() => {
              const items = forDay(selectedDay);
              if (items.length === 0) {
                return <p className="text-sm text-muted-foreground">Sin reservas este día.</p>;
              }
              return (
                <div className="max-h-96 space-y-2 overflow-y-auto">
                  <p className="text-sm text-muted-foreground">
                    {items.length} {items.length === 1 ? "reserva" : "reservas"}
                  </p>
                  {items.map((b) => (
                    <div key={b.id} className="rounded-md border p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">
                          {format(new Date(b.start_datetime), "HH:mm")} · {b.client_name}
                        </span>
                        <StatusBadge status={b.status} />
                      </div>
                      <p className="mt-1 text-muted-foreground">
                        {serviceName(b.service_id)}
                        {resourceName(b.resource_id) && ` · ${resourceName(b.resource_id)}`}
                        {b.client_phone && ` · ${b.client_phone}`}
                      </p>
                    </div>
                  ))}
                </div>
              );
            })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
