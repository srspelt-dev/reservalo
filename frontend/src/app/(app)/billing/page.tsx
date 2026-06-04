"use client";

import Link from "next/link";
import { useSubscription } from "@/hooks/use-subscription";
import { formatPrice } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function BillingPage() {
  const { data: sub, isLoading } = useSubscription();

  if (isLoading || !sub) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Facturación</h1>
        <Skeleton className="h-48 w-full max-w-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Facturación</h1>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Plan {sub.plan.name}</CardTitle>
          <CardDescription>Resumen de tu facturación</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between border-b pb-2">
            <span className="text-muted-foreground">Precio</span>
            <span className="font-medium">
              {sub.plan.price === 0 ? "Gratis" : `${formatPrice(sub.plan.price)} / mes`}
            </span>
          </div>
          <div className="flex justify-between border-b pb-2">
            <span className="text-muted-foreground">Estado</span>
            <span className="font-medium capitalize">{sub.status}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Método de pago</span>
            <span className="font-medium">Transferencia / alias</span>
          </div>
          <p className="pt-2 text-xs text-muted-foreground">
            El cobro automático con tarjeta y las facturas estarán disponibles próximamente.
            Por ahora, los planes pagos se coordinan por transferencia.
          </p>
          <Button asChild className="mt-2">
            <Link href="/plans">Cambiar de plan</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
