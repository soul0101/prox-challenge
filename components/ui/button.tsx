"use client";
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "relative inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-0 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-b from-primary to-primary/90 text-primary-foreground shadow-brand hover:brightness-105 hover:shadow-brand-lg",
        secondary:
          "bg-surface-2 text-secondary-foreground border border-border-subtle hover:bg-surface-3 hover:border-border-strong",
        outline:
          "border border-border-subtle bg-surface-1/60 text-fg backdrop-blur-sm hover:bg-surface-2/80 hover:border-border-strong",
        ghost: "text-fg-muted hover:bg-surface-3/70 hover:text-fg",
        destructive:
          "bg-destructive text-destructive-foreground shadow-soft hover:bg-destructive/90",
      },
      size: {
        default: "h-9 px-3.5 py-2",
        sm: "h-8 px-2.5 text-xs",
        icon: "h-9 w-9",
        iconSm: "h-8 w-8",
        lg: "h-10 px-5",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";
