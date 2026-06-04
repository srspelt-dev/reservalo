"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { publicApi } from "@/lib/public-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

function VerifyInner() {
  const params = useSearchParams();
  const token = params.get("token");
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    if (!token) {
      setState("error");
      return;
    }
    publicApi
      .post("/auth/verify-email", { token })
      .then(() => setState("ok"))
      .catch(() => setState("error"));
  }, [token]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <CardTitle>Verificación de email</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {state === "loading" && <p className="text-muted-foreground">Verificando...</p>}
          {state === "ok" && <p className="text-green-700">¡Tu email fue verificado! ✅</p>}
          {state === "error" && (
            <p className="text-destructive">El enlace es inválido o expiró.</p>
          )}
          <Button asChild>
            <Link href="/login">Ir al panel</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyInner />
    </Suspense>
  );
}
