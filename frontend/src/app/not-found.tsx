import Link from "next/link";
import { CalendarCheck } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
        <CalendarCheck className="h-6 w-6" />
      </div>
      <p className="mt-6 font-display text-6xl font-extrabold tracking-tight text-primary">404</p>
      <h1 className="mt-2 font-display text-2xl font-bold">Página no encontrada</h1>
      <p className="mt-2 max-w-sm text-muted-foreground">
        La página que buscás no existe o fue movida.
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-primary px-6 font-semibold text-primary-foreground shadow-sm transition hover:opacity-90"
      >
        Volver al inicio
      </Link>
    </div>
  );
}
