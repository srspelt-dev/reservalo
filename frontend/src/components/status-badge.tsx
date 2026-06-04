import { Badge } from "@/components/ui/badge";
import type { BookingStatus } from "@/lib/types";

type Variant = "default" | "success" | "warning" | "destructive" | "secondary";

const MAP: Record<BookingStatus, { label: string; variant?: Variant; className?: string }> = {
  pending: { label: "Pendiente", variant: "warning" },
  confirmed: { label: "Confirmada", variant: "success" },
  cancelled: { label: "Cancelada", variant: "destructive" },
  // Completado → indigo (#6366F1) per design system
  completed: {
    label: "Completada",
    className: "border-transparent bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300",
  },
};

export function StatusBadge({ status }: { status: BookingStatus }) {
  const { label, variant, className } = MAP[status];
  return (
    <Badge variant={className ? "outline" : variant} className={className}>
      {label}
    </Badge>
  );
}
