import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const DAYS_OF_WEEK = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
];

export function formatPrice(price: number | string): string {
  const n = typeof price === "string" ? parseFloat(price) : price;
  // Guaraní paraguayo: sin decimales (₲).
  return new Intl.NumberFormat("es-PY", {
    style: "currency",
    currency: "PYG",
    maximumFractionDigits: 0,
  }).format(n || 0);
}

// Zonas horarias comunes para la región (se pueden ampliar).
export const TIMEZONES = [
  "America/Asuncion",
  "America/Argentina/Buenos_Aires",
  "America/Sao_Paulo",
  "America/Montevideo",
  "America/Santiago",
  "America/La_Paz",
  "America/Lima",
  "America/Bogota",
  "America/Mexico_City",
];
