"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { publicApi } from "@/lib/public-api";
import { apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthShell, AuthLabel } from "@/components/auth-shell";

function ResetInner() {
  const router = useRouter();
  const token = useSearchParams().get("token");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) {
      toast.error("Enlace inválido");
      return;
    }
    setLoading(true);
    try {
      await publicApi.post("/auth/reset-password", { token, new_password: password });
      toast.success("Contraseña actualizada. Iniciá sesión.");
      router.replace("/login");
    } catch (err) {
      toast.error(apiError(err, "El enlace es inválido o expiró"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Nueva contraseña"
      subtitle="Elegí una contraseña nueva para tu cuenta."
      footer={
        <Link href="/login" className="font-semibold text-primary hover:underline">
          Volver a ingresar
        </Link>
      }
    >
      {!token ? (
        <p className="text-center text-sm text-destructive">El enlace es inválido o expiró.</p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <AuthLabel htmlFor="password">Nueva contraseña</AuthLabel>
            <div className="relative">
              <Input
                id="password"
                type={show ? "text" : "password"}
                minLength={8}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <Button type="submit" className="w-full" loading={loading}>
            Guardar contraseña
          </Button>
        </form>
      )}
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetInner />
    </Suspense>
  );
}
