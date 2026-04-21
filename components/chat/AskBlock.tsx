"use client";
import { HelpCircle } from "lucide-react";
import type { AskBlock as AskType } from "@/lib/client/chat-types";

export function AskBlock({
  ask,
  onAnswer,
  disabled,
}: {
  ask: AskType;
  onAnswer: (text: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 animate-slide-in">
      <div className="flex items-start gap-2 mb-2.5">
        <HelpCircle className="h-4 w-4 mt-0.5 text-primary shrink-0" />
        <div className="text-sm font-medium">{ask.question}</div>
      </div>
      <div className="flex flex-wrap gap-2">
        {ask.options.map((o) => (
          <button
            key={o.id}
            onClick={() => onAnswer(o.label)}
            disabled={disabled}
            className="inline-flex flex-col items-start rounded-lg border border-border bg-secondary/60 px-3 py-1.5 text-xs hover:border-primary hover:bg-secondary transition-colors disabled:opacity-50"
            title={o.detail}
          >
            <span className="font-medium">{o.label}</span>
            {o.detail && <span className="text-[10px] text-muted-foreground mt-0.5">{o.detail}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
