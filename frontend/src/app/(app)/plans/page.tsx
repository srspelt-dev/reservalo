"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { cn, formatPrice } from "@/lib/utils";
import { useSubscription } from "@/hooks/use-subscription";
import type { Plan } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function limitLabel(v: number | null, singular: string, plural: string) {
  if (v === null) return `${plural} ilimitados`;
  return `${v} ${v === 1 ? singular : plural}`;
}

export default function PlansPage() {
  const qc = useQueryClient();
  const { data: sub } = useSubscription();
  const { data: plans = [], isLoading } = useQuery<Plan[]>({
    queryKey: ["plans"],
    queryFn: async () => (await api.get<Plan[]>("/plans")).data,
  });

  const change = useMutation({
    mutationFn: (code: string) => api.post("/subscription/change", { plan_code: code }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subscription"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Plan actualizado");
    },
    onError: (e) => toast.error(apiError(e)),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Planes</h1>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-96 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Planes</h1>
        <p className="text-muted-foreground">Elegí el plan que mejor se adapta a tu negocio.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {plans.map((p) => {
          const current = sub?.plan.code === p.code;
          const featured = p.code === "business";
          return (
            <Card
              key={p.code}
              className={cn(
                "flex flex-col",
                featured && "border-primary ring-1 ring-primary",
                current && "bg-muted/40"
              )}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{p.name}</CardTitle>
                  {featured && (
                    <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">
                      Popular
                    </span>
                  )}
                </div>
                <p className="pt-2 text-2xl font-bold">
                  {p.price === 0 ? "Gratis" : formatPrice(p.price)}
                  {p.price > 0 && <span className="text-sm font-normal text-muted-foreground"> /mes</span>}
                </p>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-4">
                <ul className="flex-1 space-y-2 text-sm">
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-600" />
                    {limitLabel(p.limits.resources, "recurso", "recursos")}
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-600" />
                    {limitLabel(p.limits.services, "servicio", "servicios")}
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-600" />
                    {p.limits.bookings === null
                      ? "Reservas ilimitadas"
                      : `${p.limits.bookings} reservas/mes`}
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-600" />
                    {limitLabel(p.limits.users, "usuario", "usuarios")}
                  </li>
                  {p.features.map((f) => (
                    <li key={f.code} className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-emerald-600" />
                      {f.name}
                    </li>
                  ))}
                </ul>
                <Button
                  className="w-full"
                  variant={current ? "outline" : featured ? "default" : "secondary"}
                  disabled={current}
                  loading={change.isPending && change.variables === p.code}
                  onClick={() => change.mutate(p.code)}
                >
                  {current ? "Plan actual" : "Elegir plan"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        El cambio de plan es inmediato. Los pagos se gestionarán por transferencia/alias
        (próximamente cobro automático).
      </p>
    </div>
  );
}
