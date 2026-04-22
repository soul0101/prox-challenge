"use client";
import { motion } from "framer-motion";
import {
  BookText,
  FlaskConical,
  Workflow,
  Calculator,
  Search,
  Lightbulb,
  Quote,
  Mic,
  Shapes,
} from "lucide-react";
import { LogoMark } from "@/components/ui/LogoMark";
import { ease, staggerChildren, fadeUp } from "@/lib/ui/motion";
import type { ManifestEntry } from "@/lib/kb/types";

const SUGGESTION_ICONS = [
  { Icon: Lightbulb, tint: "text-amber-300", bg: "bg-amber-500/10" },
  { Icon: Workflow, tint: "text-violet-300", bg: "bg-violet-500/10" },
  { Icon: Calculator, tint: "text-emerald-300", bg: "bg-emerald-500/10" },
  { Icon: Search, tint: "text-sky-300", bg: "bg-sky-500/10" },
  { Icon: FlaskConical, tint: "text-fuchsia-300", bg: "bg-fuchsia-500/10" },
  { Icon: BookText, tint: "text-orange-300", bg: "bg-primary/10" },
];

const CAPS = [
  { Icon: Quote, label: "Cite pages" },
  { Icon: Shapes, label: "Draw diagrams" },
  { Icon: Calculator, label: "Run calculators" },
  { Icon: Mic, label: "Voice in" },
];

export function WelcomeHero({
  documents,
  suggestions,
  onPick,
}: {
  documents: ManifestEntry[];
  suggestions: { label: string; text: string }[];
  onPick: (text: string) => void;
}) {
  const first = documents[0];
  const title = first
    ? `Ask anything about the ${first.title}.`
    : "Ask anything about your manual.";

  return (
    <motion.div
      initial="hidden"
      animate="show"
      exit="exit"
      variants={staggerChildren}
      className="mx-auto flex w-full max-w-2xl flex-col items-center text-center py-10"
    >
      {/* Animated mark */}
      <motion.div variants={fadeUp} className="relative mb-6">
        <div className="absolute inset-0 -z-10 rounded-full bg-primary/20 blur-2xl" />
        <LogoMark size={56} animated />
      </motion.div>

      {/* Headline */}
      <motion.h1
        variants={fadeUp}
        className="text-display-lg bg-gradient-text tracking-tight"
      >
        {title}
      </motion.h1>
      <motion.p
        variants={fadeUp}
        className="mt-3 max-w-xl text-[15px] leading-relaxed text-fg-muted"
      >
        I read your manuals end-to-end with vision — I&apos;ll cite pages, surface
        diagrams, and draw flowcharts or calculators when words aren&apos;t enough.
      </motion.p>

      {/* Suggestion grid */}
      {suggestions.length > 0 && (
        <motion.div
          variants={staggerChildren}
          className="mt-8 grid w-full gap-2.5 sm:grid-cols-2"
        >
          {suggestions.slice(0, 4).map((s, i) => {
            const { Icon, tint, bg } = SUGGESTION_ICONS[i % SUGGESTION_ICONS.length];
            return (
              <motion.button
                key={i}
                variants={fadeUp}
                onClick={() => onPick(s.text)}
                whileHover={{ y: -2, transition: { duration: 0.15, ease: ease.smooth } }}
                whileTap={{ scale: 0.985 }}
                className="group relative overflow-hidden rounded-2xl border border-border-subtle bg-surface-1/70 p-4 text-left backdrop-blur-sm transition-colors hover:border-primary/50 hover:bg-surface-2/80"
              >
                <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br from-primary/10 to-transparent opacity-0 blur-xl transition-opacity group-hover:opacity-100" />
                <div className="flex items-start gap-3">
                  <div
                    className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${bg} ${tint}`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-medium leading-snug text-fg line-clamp-2">
                      {s.label}
                    </div>
                  </div>
                </div>
              </motion.button>
            );
          })}
        </motion.div>
      )}

      {/* Capabilities strip */}
      <motion.div
        variants={fadeUp}
        className="mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-2"
      >
        {CAPS.map(({ Icon, label }) => (
          <span
            key={label}
            className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-fg-dim"
          >
            <Icon className="h-3 w-3 text-primary/80" />
            {label}
          </span>
        ))}
      </motion.div>
    </motion.div>
  );
}
