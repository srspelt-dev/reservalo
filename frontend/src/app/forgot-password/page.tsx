"use client";

import { useState } from "react";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { toast } from "sonner";
import { publicApi } from "@/lib/public-api";
import { apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthShell, AuthLabel } from "@/components/auth-shell";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [devToken, setDevToken] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await publicApi.post<{ message: string; reset_token?: string }>(
        "/auth/forgot-password",
        { email }
      );
      setDevToken(data.reset_token ?? null); // present only in development
      setSent(true);
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Recuperar contraseña"
      subtitle="Te enviamos un enlace para restablecerla."
      footer={
        <Link href="/login" className="font-semibold text-primary hover:underline">
          Volver a ingresar
        </Link>
      }
    >
      {sent ? (
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
            <MailCheck className="h-6 w-6 text-emerald-600" />
          </div>
          <p className="text-sm text-muted-foreground">
            Si <span className="font-medium text-foreground">{email}</span> tiene una cuenta, te
            enviamos un enlace para restablecer tu contraseña.
          </p>
          {devToken && (
            <div className="rounded-lg border bg-muted/50 p-3 text-sm">
              <p className="mb-2 text-muted-foreground">Modo desarrollo (sin email):</p>
              <Button asChild size="sm" className="w-full">
                <Link href={`/reset-password?token=${devToken}`}>Restablecer ahora</Link>
              </Button>
            </div>
          )}
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <AuthLabel htmlFor="email">Email</AuthLabel>
            <Input
              id="email"
              type="email"
              placeholder="nombre@empresa.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full" loading={loading}>
            Enviar enlace
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
