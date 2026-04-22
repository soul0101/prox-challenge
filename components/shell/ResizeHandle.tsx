"use client";
import { cn } from "@/lib/utils";

export function ResizeHandle({
  onMouseDown,
  active,
  className,
}: {
  onMouseDown: (e: React.MouseEvent) => void;
  active?: boolean;
  className?: string;
}) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      onMouseDown={onMouseDown}
      className={cn(
        "group relative w-1.5 shrink-0 cursor-col-resize select-none transition-colors",
        active ? "bg-primary/40" : "bg-transparent hover:bg-primary/25",
        className,
      )}
    >
      {/* Affordance rail */}
      <div
        className={cn(
          "pointer-events-none absolute left-1/2 top-1/2 h-8 w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors",
          active
            ? "bg-primary"
            : "bg-border-strong group-hover:bg-primary/80",
        )}
      />
    </div>
  );
}
