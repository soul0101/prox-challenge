"use client";
import { cn } from "@/lib/utils";

/**
 * Geometric spark/asterisk logo mark. Rendered inline as SVG so it inherits
 * currentColor and scales crisply. Used in the header, welcome hero, and
 * splash.
 */
export function LogoMark({
  className,
  size = 20,
  animated = false,
}: {
  className?: string;
  size?: number;
  animated?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={cn(animated && "animate-breathe", className)}
    >
      <defs>
        <linearGradient id="lm-g1" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="hsl(24 100% 68%)" />
          <stop offset="1" stopColor="hsl(18 92% 48%)" />
        </linearGradient>
        <radialGradient id="lm-g2" cx="16" cy="16" r="16" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="hsl(40 100% 72%)" stopOpacity="0.9" />
          <stop offset="1" stopColor="hsl(24 100% 60%)" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* Soft halo */}
      <circle cx="16" cy="16" r="15" fill="url(#lm-g2)" opacity="0.7" />
      {/* Four-pointed spark */}
      <path
        d="M16 2 C16.8 9 17.6 11.2 22 12 C17.6 12.8 16.8 15 16 22 C15.2 15 14.4 12.8 10 12 C14.4 11.2 15.2 9 16 2 Z"
        fill="url(#lm-g1)"
      />
      <path
        d="M16 10 C16.4 14 16.8 15 19 15.4 C16.8 15.8 16.4 16.8 16 20.8 C15.6 16.8 15.2 15.8 13 15.4 C15.2 15 15.6 14 16 10 Z"
        fill="hsl(40 100% 88%)"
        opacity="0.9"
      />
      {/* Thin orbit ring */}
      <circle cx="16" cy="16" r="13.5" stroke="hsl(24 95% 58%)" strokeOpacity="0.35" strokeWidth="0.8" />
    </svg>
  );
}
