import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  compact = false,
}: {
  icon: React.ElementType;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 text-center",
        compact
          ? "px-4 py-8"
          : "rounded-xl border border-dashed bg-card/40 px-6 py-12",
        className
      )}
    >
      <div
        className={cn(
          "flex items-center justify-center rounded-2xl bg-primary/10 text-primary",
          compact ? "h-11 w-11" : "h-14 w-14"
        )}
      >
        <Icon className={compact ? "h-5 w-5" : "h-7 w-7"} />
      </div>
      <div className="space-y-1">
        <p className={cn("font-display font-semibold", compact ? "text-sm" : "text-lg")}>
          {title}
        </p>
        {description && (
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
