"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { api, setTokens, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthShell, AuthLabel } from "@/components/auth-shell";
import type { TokenResponse } from "@/lib/types";

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    business_name: "",
    slug: "",
    name: "",
    email: "",
    password: "",
    booking_mode: "appointments",
  });
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  function update(key: keyof typeof form, value: string) {
    setForm((f) => {
      const next = { ...f, [key]: value };
      if (key === "business_name") next.slug = slugify(value);
      return next;
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post<TokenResponse>("/auth/register", form);
      setTokens(data.access_token, data.refresh_token);
      toast.success("¡Negocio creado!");
      router.replace("/dashboard");
    } catch (err) {
      toast.error(apiError(err, "No se pudo registrar"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Creá tu negocio"
      subtitle="Empezá a recibir reservas online en minutos."
      footer={
        <>
          ¿Ya tenés cuenta?{" "}
          <Link href="/login" className="font-semibold text-primary hover:underline">
            Ingresá
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <AuthLabel htmlFor="bmode">¿Qué tipo de negocio es?</AuthLabel>
          <div className="grid grid-cols-2 gap-2">
            {[
              { v: "appointments", t: "Turnos", d: "Peluquería, consultorio…" },
              { v: "events", t: "Eventos", d: "Salón de eventos" },
            ].map((o) => (
              <button
                key={o.v}
                type="button"
                onClick={() => update("booking_mode", o.v)}
                className={
                  "rounded-lg border p-3 text-left text-sm transition-colors hover:border-primary " +
                  (form.booking_mode === o.v ? "border-primary bg-primary/5" : "border-border")
                }
              >
                <p className="font-medium">{o.t}</p>
                <p className="text-xs text-muted-foreground">{o.d}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <AuthLabel htmlFor="business_name">Nombre del negocio</AuthLabel>
          <Input
            id="business_name"
            value={form.business_name}
            onChange={(e) => update("business_name", e.target.value)}
            required
          />
        </div>

        <div className="space-y-1.5">
          <AuthLabel htmlFor="slug">URL pública</AuthLabel>
          <div className="flex items-center gap-1 text-sm">
            <span className="text-muted-foreground">/booking/</span>
            <Input
              id="slug"
              value={form.slug}
              onChange={(e) => update("slug", slugify(e.target.value))}
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <AuthLabel htmlFor="name">Tu nombre</AuthLabel>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <AuthLabel htmlFor="email">Email</AuthLabel>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              required
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <AuthLabel htmlFor="password">Contraseña</AuthLabel>
          <div className="relative">
            <Input
              id="password"
              type={show ? "text" : "password"}
              minLength={8}
              value={form.password}
              onChange={(e) => update("password", e.target.value)}
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
          Crear negocio
        </Button>
      </form>
    </AuthShell>
  );
}
