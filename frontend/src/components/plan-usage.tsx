import { cn } from "@/lib/utils";
import type { Subscription } from "@/lib/types";

const ROWS: { key: keyof Subscription["usage"]; label: string }[] = [
  { key: "resources", label: "Recursos" },
  { key: "services", label: "Servicios" },
  { key: "bookings", label: "Reservas (mes)" },
  { key: "users", label: "Usuarios" },
];

export function PlanUsage({ sub }: { sub: Subscription }) {
  return (
    <div className="space-y-4">
      {ROWS.map(({ key, label }) => {
        const used = sub.usage[key];
        const limit = sub.limits[key];
        const unlimited = limit === null;
        const ratio = unlimited || !limit ? 0 : Math.min(1, used / limit);
        const near = !unlimited && ratio >= 0.8;
        return (
          <div key={key} className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{label}</span>
              <span className="font-medium tabular-nums">
                {used} {unlimited ? "/ ∞" : `/ ${limit}`}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  unlimited ? "bg-emerald-500/60" : near ? "bg-amber-500" : "bg-primary"
                )}
                style={{ width: unlimited ? "100%" : `${ratio * 100}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
