"use client";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Mic, MicOff } from "lucide-react";
import { cn } from "@/lib/utils";

export function VoiceButton({
  onTranscript,
  disabled,
}: {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState<boolean | null>(null);
  const recRef = useRef<any>(null);

  useEffect(() => {
    const W = window as any;
    const SR = W.SpeechRecognition || W.webkitSpeechRecognition;
    setSupported(!!SR);
  }, []);

  const toggle = () => {
    if (listening) {
      recRef.current?.stop();
      setListening(false);
      return;
    }
    const W = window as any;
    const SR = W.SpeechRecognition || W.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (e: any) => {
      const text = Array.from(e.results)
        .map((r: any) => r[0]?.transcript || "")
        .join(" ")
        .trim();
      if (text) onTranscript(text);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    rec.start();
    recRef.current = rec;
    setListening(true);
  };

  if (supported === false) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled || !supported}
      aria-pressed={listening}
      aria-label={listening ? "Stop listening" : "Voice input"}
      className={cn(
        "relative inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
        listening
          ? "bg-primary text-primary-foreground"
          : "text-fg-dim hover:bg-surface-3/70 hover:text-fg",
        (disabled || !supported) && "pointer-events-none opacity-50",
      )}
      title={listening ? "Stop listening" : "Voice input"}
    >
      {listening && (
        <>
          <motion.span
            className="pointer-events-none absolute inset-0 rounded-lg bg-primary/50"
            animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
          />
          <motion.span
            className="pointer-events-none absolute inset-0 rounded-lg bg-primary/30"
            animate={{ scale: [1, 1.8, 1], opacity: [0.35, 0, 0.35] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut", delay: 0.3 }}
          />
        </>
      )}
      {listening ? (
        <MicOff className="relative h-4 w-4" />
      ) : (
        <Mic className="relative h-4 w-4" />
      )}
    </button>
  );
}
