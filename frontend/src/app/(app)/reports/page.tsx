"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { CalendarCheck, DollarSign, Ban, TrendingUp } from "lucide-react";
import { format, subDays } from "date-fns";
import { es } from "date-fns/locale";
import { api } from "@/lib/api";
import { formatPrice } from "@/lib/utils";
import { useCurrentUser } from "@/hooks/use-auth";
import type { ReportOut } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const PERIODS = [
  { days: 7, label: "7 días" },
  { days: 30, label: "30 días" },
  { days: 90, label: "90 días" },
];

function Stat({
  title,
  value,
  icon: Icon,
}: {
  title: string;
  value: string;
  icon: React.ElementType;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold tracking-tight">{value}</div>
      </CardContent>
    </Card>
  );
}

export default function ReportsPage() {
  const router = useRouter();
  const { data: me } = useCurrentUser();
  const [days, setDays] = useState(30);

  useEffect(() => {
    if (me && me.role !== "owner") router.replace("/dashboard");
  }, [me, router]);

  const dateFrom = format(subDays(new Date(), days - 1), "yyyy-MM-dd");
  const dateTo = format(new Date(), "yyyy-MM-dd");

  const { data, isLoading } = useQuery<ReportOut>({
    queryKey: ["reports", days],
    queryFn: async () =>
      (await api.get<ReportOut>("/reports", { params: { date_from: dateFrom, date_to: dateTo } }))
        .data,
    enabled: me?.role === "owner",
  });

  const maxDay = data ? Math.max(1, ...data.by_day.map((d) => d.count)) : 1;
  const maxSvc = data ? Math.max(1, ...data.top_services.map((s) => s.count)) : 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight">Reportes</h1>
        <div className="flex items-center gap-2">
          {PERIODS.map((p) => (
            <Button
              key={p.days}
              variant={days === p.days ? "default" : "outline"}
              size="sm"
              onClick={() => setDays(p.days)}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      {isLoading || !data ? (
        <p className="text-muted-foreground">Cargando...</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat title="Reservas" value={String(data.total_bookings)} icon={CalendarCheck} />
            <Stat title="Ingresos (estimado)" value={formatPrice(data.revenue)} icon={TrendingUp} />
            <Stat title="Cobrado" value={formatPrice(data.revenue_paid)} icon={DollarSign} />
            <Stat
              title="Tasa de cancelación"
              value={`${Math.round(data.cancellation_rate * 100)}%`}
              icon={Ban}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Por estado</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 text-sm">
                {(["confirmed", "completed", "pending", "cancelled"] as const).map((k) => (
                  <div key={k} className="flex items-center justify-between rounded-md border px-3 py-2">
                    <span className="capitalize text-muted-foreground">
                      {k === "confirmed"
                        ? "Confirmadas"
                        : k === "completed"
                          ? "Completadas"
                          : k === "pending"
                            ? "Pendientes"
                            : "Canceladas"}
                    </span>
                    <span className="font-semibold">{data.by_status[k]}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Servicios más reservados</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {data.top_services.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin datos en el período.</p>
                ) : (
                  data.top_services.map((s) => (
                    <div key={s.name} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span>{s.name}</span>
                        <span className="font-medium">{s.count}</span>
                      </div>
                      <div className="h-2 rounded bg-muted">
                        <div
                          className="h-2 rounded bg-primary"
                          style={{ width: `${(s.count / maxSvc) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Reservas por día</CardTitle>
            </CardHeader>
            <CardContent>
              {data.by_day.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin reservas en el período.</p>
              ) : (
                <div className="flex h-40 items-end gap-1 overflow-x-auto">
                  {data.by_day.map((d) => (
                    <div key={d.day} className="flex flex-1 flex-col items-center gap-1" title={`${d.day}: ${d.count}`}>
                      <div
                        className="w-full min-w-2 rounded-t bg-primary"
                        style={{ height: `${(d.count / maxDay) * 100}%` }}
                      />
                      <span className="text-[9px] text-muted-foreground">
                        {format(new Date(d.day + "T00:00:00"), "d/M", { locale: es })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
