"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "w-full resize-none rounded-xl border border-border-subtle bg-surface-1 px-4 py-3 text-[14px] text-fg outline-none transition-colors placeholder:text-fg-dim focus:border-primary/50 focus:bg-surface-2/70 focus:ring-2 focus:ring-primary/25 disabled:opacity-50 scrollbar-thin",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";
