/**
 * Ambient background layer — a radial gradient of orange (top-left) and cool
 * blue (bottom-right), plus a faint noise texture. Rendered once in the root
 * layout. `pointer-events: none`, `fixed`, `-z-10` — never interactive.
 */
export function BackgroundFX() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      {/* Base gradient glows */}
      <div
        className="absolute -left-[15%] -top-[15%] h-[60vh] w-[60vw] rounded-full opacity-[0.22] blur-3xl"
        style={{
          background:
            "radial-gradient(ellipse at center, hsl(24 95% 58%) 0%, transparent 60%)",
        }}
      />
      <div
        className="absolute -right-[15%] -bottom-[20%] h-[55vh] w-[55vw] rounded-full opacity-[0.18] blur-3xl"
        style={{
          background:
            "radial-gradient(ellipse at center, hsl(220 80% 60%) 0%, transparent 60%)",
        }}
      />
      <div
        className="absolute left-[35%] top-[45%] h-[40vh] w-[40vw] rounded-full opacity-[0.1] blur-3xl"
        style={{
          background:
            "radial-gradient(ellipse at center, hsl(280 70% 55%) 0%, transparent 60%)",
        }}
      />
      {/* Noise grain */}
      <div className="absolute inset-0 noise opacity-[0.035] mix-blend-overlay" />
      {/* Top edge accent line */}
      <div className="absolute left-0 right-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
    </div>
  );
}
