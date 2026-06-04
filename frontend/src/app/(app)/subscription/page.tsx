"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { useSubscription } from "@/hooks/use-subscription";
import { formatPrice } from "@/lib/utils";
import { PlanUsage } from "@/components/plan-usage";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function SubscriptionPage() {
  const { data: sub, isLoading } = useSubscription();

  if (isLoading || !sub) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Suscripción</h1>
        <Skeleton className="h-64 w-full max-w-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight">Suscripción</h1>
        <Button asChild>
          <Link href="/plans">Cambiar de plan</Link>
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Plan {sub.plan.name}
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                {sub.status}
              </span>
            </CardTitle>
            <CardDescription>
              {sub.plan.price === 0 ? "Gratis" : `${formatPrice(sub.plan.price)} / mes`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm font-medium">Incluye</p>
            <ul className="space-y-2 text-sm">
              {sub.plan.features.length === 0 ? (
                <li className="text-muted-foreground">Funciones básicas</li>
              ) : (
                sub.plan.features.map((f) => (
                  <li key={f.code} className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-600" />
                    {f.name}
                  </li>
                ))
              )}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Uso del plan</CardTitle>
            <CardDescription>Límites utilizados de tu plan actual</CardDescription>
          </CardHeader>
          <CardContent>
            <PlanUsage sub={sub} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
