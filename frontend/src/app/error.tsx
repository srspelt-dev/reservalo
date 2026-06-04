"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the error to the console for debugging.
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <h1 className="mt-6 font-display text-2xl font-bold">Algo salió mal</h1>
      <p className="mt-2 max-w-sm text-muted-foreground">
        Tuvimos un problema al cargar esta página. Probá de nuevo en un momento.
      </p>
      <div className="mt-6 flex gap-2">
        <button
          onClick={reset}
          className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-6 font-semibold text-primary-foreground shadow-sm transition hover:opacity-90"
        >
          Reintentar
        </button>
        <Link
          href="/"
          className="inline-flex h-11 items-center justify-center rounded-xl border bg-background px-6 font-semibold transition hover:bg-accent"
        >
          Ir al inicio
        </Link>
      </div>
    </div>
  );
}
