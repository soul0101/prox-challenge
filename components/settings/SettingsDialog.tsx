"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  Eye,
  EyeOff,
  ExternalLink,
  KeyRound,
  Palette,
  RotateCcw,
  X,
  Zap,
} from "lucide-react";
import {
  MODEL_TIERS,
  type ModelTier,
  type Settings,
} from "@/lib/client/settings";
import { cn } from "@/lib/utils";
import { ease } from "@/lib/ui/motion";

type ServerConfig = {
  serverHasKey: boolean;
  requiresUserKey: boolean;
  isVercel: boolean;
};

export function SettingsDialog({
  open,
  firstVisit,
  settings,
  onClose,
  onUpdate,
  onReset,
}: {
  open: boolean;
  firstVisit?: boolean;
  settings: Settings;
  onClose: () => void;
  onUpdate: (patch: Partial<Settings>) => void;
  onReset: () => void;
}) {
  const [serverConfig, setServerConfig] = useState<ServerConfig | null>(null);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch("/api/config")
      .then((r) => r.json())
      .then((c) => setServerConfig(c))
      .catch(() => setServerConfig(null));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="settings-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            key="settings-panel"
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.22, ease: ease.smooth }}
            className="relative w-full max-w-[520px] overflow-hidden rounded-2xl border border-border-subtle bg-surface-1 shadow-pop"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Settings"
          >
            <header className="flex items-center justify-between border-b border-border-subtle px-5 py-3.5">
              <div className="flex items-center gap-2.5">
                <div className="grid h-8 w-8 place-items-center rounded-lg border border-border-subtle bg-surface-2">
                  <Palette className="h-3.5 w-3.5 text-primary" />
                </div>
                <div>
                  <div className="text-[13.5px] font-semibold tracking-tight text-fg">
                    {firstVisit ? "Welcome" : "Settings"}
                  </div>
                  <div className="font-mono text-[10.5px] text-fg-dim">
                    {firstVisit
                      ? "configure your copilot — auto-saved in this browser"
                      : "auto-saved in this browser"}
                  </div>
                </div>
              </div>
              <button
                onClick={onClose}
                className="grid h-8 w-8 place-items-center rounded-lg text-fg-dim transition-colors hover:bg-surface-2 hover:text-fg"
                aria-label="Close settings"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="max-h-[68vh] overflow-y-auto px-5 py-4 scrollbar-thin">
              <ApiKeySection
                value={settings.apiKey}
                onChange={(apiKey) => onUpdate({ apiKey })}
                showKey={showKey}
                onToggleShow={() => setShowKey((s) => !s)}
                config={serverConfig}
              />

              <Divider />

              <ModelSection
                icon={<Zap className="h-3.5 w-3.5" />}
                label="Chat model"
                hint="Runs the orchestrator loop — retrieval, tool calls, prose."
                value={settings.model}
                onChange={(model) => onUpdate({ model })}
              />

              <Divider />

              <ModelSection
                icon={<Palette className="h-3.5 w-3.5" />}
                label="Artifact author"
                hint="Writes the SVG / React / Mermaid code for visuals."
                value={settings.artifactModel}
                onChange={(artifactModel) => onUpdate({ artifactModel })}
              />
            </div>

            <footer className="flex items-center justify-between gap-2 border-t border-border-subtle bg-surface-1/80 px-5 py-3">
              <button
                onClick={onReset}
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 font-mono text-[10.5px] text-fg-dim transition-colors hover:bg-surface-2 hover:text-fg"
              >
                <RotateCcw className="h-3 w-3" />
                Reset to defaults
              </button>
              {firstVisit ? (
                <button
                  onClick={onClose}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-primary/50 bg-primary/10 px-3 py-1.5 text-[11.5px] font-medium text-fg transition-colors hover:bg-primary/20"
                >
                  Start asking →
                </button>
              ) : (
                <div className="flex items-center gap-1 font-mono text-[10px] text-fg-dim">
                  <Check className="h-3 w-3 text-emerald-400" />
                  saved
                </div>
              )}
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ApiKeySection({
  value,
  onChange,
  showKey,
  onToggleShow,
  config,
}: {
  value: string;
  onChange: (v: string) => void;
  showKey: boolean;
  onToggleShow: () => void;
  config: ServerConfig | null;
}) {
  const trimmed = value.trim();
  const malformed = trimmed.length > 0 && !trimmed.startsWith("sk-ant-");

  let statusTone: "ok" | "warn" | "err" = "ok";
  let statusLabel = "";
  if (trimmed) {
    statusTone = malformed ? "err" : "ok";
    statusLabel = malformed ? "Doesn't look like an Anthropic key" : "Using your key";
  } else if (config?.requiresUserKey) {
    statusTone = "err";
    statusLabel = "Required — the server has no key configured";
  } else if (config?.serverHasKey) {
    statusTone = "ok";
    statusLabel = "Using the server's key";
  } else {
    statusTone = "warn";
    statusLabel = "Checking server…";
  }

  return (
    <section>
      <SectionHeader
        icon={<KeyRound className="h-3.5 w-3.5" />}
        label="Anthropic API key"
        hint="Stored only in this browser (localStorage). Sent per request."
      />
      <div className="mt-2.5 flex items-stretch gap-1.5">
        <div className="relative flex-1">
          <input
            type={showKey ? "text" : "password"}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="sk-ant-api03-…"
            spellCheck={false}
            autoComplete="off"
            className={cn(
              "w-full rounded-lg border bg-surface-2/60 px-3 py-2 font-mono text-[12.5px] text-fg placeholder:text-fg-dim focus:outline-none focus:ring-2 focus:ring-primary/40",
              malformed
                ? "border-destructive/60"
                : "border-border-subtle focus:border-primary/50",
            )}
          />
        </div>
        <button
          onClick={onToggleShow}
          className="inline-flex items-center gap-1 rounded-lg border border-border-subtle bg-surface-2/60 px-2 text-fg-dim transition-colors hover:bg-surface-2 hover:text-fg"
          aria-label={showKey ? "Hide key" : "Show key"}
          type="button"
        >
          {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <StatusPill tone={statusTone} label={statusLabel} />
        <a
          href="https://console.anthropic.com/settings/keys"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-mono text-[10.5px] text-fg-dim transition-colors hover:text-primary"
        >
          get a key
          <ExternalLink className="h-2.5 w-2.5" />
        </a>
      </div>
    </section>
  );
}

function ModelSection({
  icon,
  label,
  hint,
  value,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  value: ModelTier;
  onChange: (v: ModelTier) => void;
}) {
  return (
    <section>
      <SectionHeader icon={icon} label={label} hint={hint} />
      <div className="mt-2.5 grid grid-cols-3 gap-1.5">
        {MODEL_TIERS.map((opt) => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={cn(
                "group flex flex-col items-start gap-0.5 rounded-lg border px-2.5 py-2 text-left transition-colors",
                active
                  ? "border-primary/60 bg-primary/10"
                  : "border-border-subtle bg-surface-2/40 hover:bg-surface-2/70",
              )}
            >
              <span
                className={cn(
                  "text-[12px] font-medium",
                  active ? "text-fg" : "text-fg",
                )}
              >
                {opt.label}
              </span>
              <span className="text-[10.5px] leading-snug text-fg-dim">
                {opt.blurb}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function SectionHeader({
  icon,
  label,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <div className="flex items-center gap-1.5">
        <span className="text-fg-dim">{icon}</span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg">
          {label}
        </span>
      </div>
      {hint && (
        <span className="ml-4 truncate text-[11px] text-fg-dim">{hint}</span>
      )}
    </div>
  );
}

function Divider() {
  return <div className="my-5 h-px bg-border-subtle" />;
}

function StatusPill({
  tone,
  label,
}: {
  tone: "ok" | "warn" | "err";
  label: string;
}) {
  const colors: Record<typeof tone, string> = {
    ok: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    warn: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    err: "border-destructive/40 bg-destructive/10 text-red-300",
  };
  const dot: Record<typeof tone, string> = {
    ok: "bg-emerald-400",
    warn: "bg-amber-400",
    err: "bg-destructive",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10.5px]",
        colors[tone],
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", dot[tone])} />
      {label}
    </span>
  );
}
