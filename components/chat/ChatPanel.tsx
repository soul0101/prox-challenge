"use client";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Send, BookOpen, Wrench, Square } from "lucide-react";
import type { Manifest, ManifestEntry } from "@/lib/kb/types";
import type {
  ArtifactAttachment,
  ChatMessage,
  SourceAttachment,
  ToolChip,
} from "@/lib/client/chat-types";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ToolChipRow } from "./ToolChipRow";
import { CitationText } from "./CitationText";
import { SourceCard } from "./SourceCard";
import { ArtifactCard } from "./ArtifactCard";
import { PendingArtifactCard } from "./PendingArtifactCard";
import { AskBlock } from "./AskBlock";
import { VoiceButton } from "./VoiceButton";

type ArtifactEvent = {
  id: string;
  kind: ArtifactAttachment["versions"][number]["kind"];
  title: string;
  code: string;
  group_id?: string;
  version_note?: string;
};

type Props = {
  manifest: Manifest;
  artifactsByGroup: Map<string, ArtifactAttachment>;
  onOpenSource: (doc: string, page: number, attach?: SourceAttachment | null) => void;
  onArtifactEvent: (e: ArtifactEvent, callback?: (groupId: string) => void) => void;
  onOpenArtifact: (groupId: string, version?: number) => void;
  activeGroupId: string | null;
  onOpenLibrary: () => void;
};

function newId() {
  return Math.random().toString(36).slice(2, 10);
}

export type ChatPanelHandle = {
  /** Submit a chat message programmatically (e.g. from auto-fix flows). */
  submit: (text: string) => void;
};

export const ChatPanel = forwardRef<ChatPanelHandle, Props>(function ChatPanel(
  {
    manifest,
    artifactsByGroup,
    onOpenSource,
    onArtifactEvent,
    onOpenArtifact,
    activeGroupId,
    onOpenLibrary,
  }: Props,
  ref,
) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const prompts = useMemo(() => {
    const picks: { label: string; text: string }[] = [];
    for (const d of manifest.documents) {
      for (const p of d.map.suggested_prompts.slice(0, 2)) {
        picks.push({ label: p, text: p });
      }
    }
    return picks.slice(0, 6);
  }, [manifest.documents]);

  // Auto-scroll on message change.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const updateLast = useCallback(
    (fn: (m: ChatMessage) => ChatMessage) => {
      setMessages((ms) => {
        if (!ms.length) return ms;
        const copy = ms.slice();
        copy[copy.length - 1] = fn(copy[copy.length - 1]);
        return copy;
      });
    },
    [],
  );

  const submit = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;

      const userMsg: ChatMessage = {
        id: newId(),
        role: "user",
        content: trimmed,
        toolChips: [],
        sources: [],
        artifactGroups: [],
      };
      const assistantMsg: ChatMessage = {
        id: newId(),
        role: "assistant",
        content: "",
        toolChips: [],
        sources: [],
        artifactGroups: [],
        streaming: true,
      };
      const nextHistory: ChatMessage[] = [...messages, userMsg, assistantMsg];
      setMessages(nextHistory);
      setInput("");
      setBusy(true);
      setError(null);

      const ac = new AbortController();
      abortRef.current = ac;

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: ac.signal,
          body: JSON.stringify({
            history: nextHistory
              .filter((m) => m.role === "user" || (m.role === "assistant" && m.content))
              .map((m) => ({ role: m.role, content: m.content })),
          }),
        });
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
        await consumeSSE(res.body, (e) => handleEvent(e));
      } catch (err: any) {
        if (err?.name !== "AbortError") setError(err?.message || "stream error");
      } finally {
        updateLast((m) => ({ ...m, streaming: false }));
        setBusy(false);
        abortRef.current = null;
      }
    },
    [busy, messages, updateLast],
  );

  const handleEvent = useCallback(
    (e: any) => {
      if (!e?.type) return;
      switch (e.type) {
        case "delta":
          updateLast((m) => ({ ...m, content: m.content + String(e.text || "") }));
          break;
        case "assistant":
          // Final assembled text — prefer over cumulative deltas if it's longer.
          updateLast((m) => {
            const incoming = String(e.text || "");
            if (incoming.length >= m.content.length) return { ...m, content: incoming };
            return m;
          });
          break;
        case "tool_start": {
          const id = String(e.id);
          updateLast((m) => {
            // Dedupe: if we already have a chip with this id (e.g. from an
            // earlier partial), keep it and just ensure it has the name/input.
            const existing = m.toolChips.find((c) => c.id === id);
            if (existing) {
              return {
                ...m,
                toolChips: m.toolChips.map((c) =>
                  c.id === id
                    ? {
                        ...c,
                        name: String(e.name || c.name),
                        input: { ...(c.input || {}), ...(e.input || {}) },
                      }
                    : c,
                ),
              };
            }
            const chip: ToolChip = {
              id,
              name: String(e.name),
              status: "running",
              input: e.input || {},
            };
            return { ...m, toolChips: [...m.toolChips, chip] };
          });
          break;
        }
        case "tool_update": {
          const id = String(e.id);
          updateLast((m) => ({
            ...m,
            toolChips: m.toolChips.map((c) =>
              c.id === id
                ? { ...c, input: { ...(c.input || {}), ...(e.input || {}) } }
                : c,
            ),
          }));
          break;
        }
        case "tool_end": {
          updateLast((m) => ({
            ...m,
            toolChips: m.toolChips.map((c) =>
              c.id === String(e.id)
                ? { ...c, status: "done", summary: e.summary }
                : c,
            ),
          }));
          break;
        }
        case "source": {
          const s: SourceAttachment = {
            doc: String(e.doc),
            doc_title: String(e.doc_title),
            page: Number(e.page),
            url: String(e.url),
            caption: e.caption,
            cropUrl: e.cropUrl,
            bbox: e.bbox,
          };
          updateLast((m) => ({ ...m, sources: [...m.sources, s] }));
          break;
        }
        case "artifact": {
          onArtifactEvent(
            {
              id: String(e.id),
              kind: e.kind,
              title: String(e.title),
              code: String(e.code),
              group_id: e.group_id,
              version_note: e.version_note,
            },
            (groupId) => {
              // Track new groups on the in-flight assistant turn so the inline
              // card appears in the right message. Re-emits as v2+ won't add a
              // new group to the message — the existing card just updates.
              updateLast((m) =>
                m.artifactGroups.includes(groupId)
                  ? m
                  : { ...m, artifactGroups: [...m.artifactGroups, groupId] },
              );
            },
          );
          break;
        }
        case "ask": {
          updateLast((m) => ({
            ...m,
            ask: {
              question: String(e.question),
              options: e.options,
              allow_free_text: Boolean(e.allow_free_text),
            },
          }));
          break;
        }
        case "error": {
          setError(String(e.message || "error"));
          break;
        }
      }
    },
    [onArtifactEvent, updateLast],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
    updateLast((m) => ({ ...m, streaming: false }));
  }, [updateLast]);

  useImperativeHandle(ref, () => ({ submit }), [submit]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="grid h-7 w-7 place-items-center rounded-md bg-primary/15 text-primary">
            <Wrench className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-semibold">Manual Copilot</div>
            <div className="text-[10px] text-muted-foreground">
              {manifest.documents.length} document{manifest.documents.length !== 1 && "s"} ·{" "}
              {manifest.documents.reduce((s, d) => s + d.page_count, 0)} pages ingested
            </div>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={onOpenLibrary}>
          <BookOpen className="h-3.5 w-3.5" /> Library
        </Button>
      </div>

      {/* Thread */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto w-full max-w-3xl px-4 py-6 space-y-5">
          {messages.length === 0 && (
            <WelcomeState
              documents={manifest.documents}
              suggestions={prompts}
              onPick={(t) => submit(t)}
            />
          )}
          {messages.map((m) => (
            <MessageBubble
              key={m.id}
              message={m}
              documents={manifest.documents}
              artifactsByGroup={artifactsByGroup}
              onOpenSource={onOpenSource}
              onOpenArtifact={onOpenArtifact}
              activeGroupId={activeGroupId}
              onPickAskOption={(text) => submit(text)}
              busy={busy}
            />
          ))}
          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Composer */}
      <div className="border-t border-border bg-background/60 px-4 py-3">
        <div className="mx-auto flex w-full max-w-3xl items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about setup, troubleshooting, duty cycle, polarity…"
            rows={2}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(input);
              }
            }}
            disabled={busy}
            className="min-h-[44px] max-h-40 py-2.5"
          />
          <VoiceButton onTranscript={(t) => submit(t)} disabled={busy} />
          {busy ? (
            <Button variant="destructive" size="icon" onClick={stop} title="Stop">
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              size="icon"
              onClick={() => submit(input)}
              disabled={!input.trim()}
              title="Send"
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
});

function WelcomeState({
  documents,
  suggestions,
  onPick,
}: {
  documents: ManifestEntry[];
  suggestions: { label: string; text: string }[];
  onPick: (text: string) => void;
}) {
  const first = documents[0];
  return (
    <div className="text-center animate-fade-in py-8">
      <h1 className="text-2xl font-semibold tracking-tight">
        {first ? `Ask anything about the ${first.title}.` : "Manual Copilot"}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        I read the manuals end-to-end with vision. I'll cite pages, surface diagrams, and draw
        flowcharts or calculators when words aren't enough.
      </p>
      {suggestions.length > 0 && (
        <div className="mt-7 grid gap-2 sm:grid-cols-2">
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => onPick(s.text)}
              className="rounded-xl border border-border bg-card px-4 py-3 text-left text-sm hover:border-primary/60 transition-colors"
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MessageBubble({
  message,
  documents,
  artifactsByGroup,
  onOpenSource,
  onOpenArtifact,
  activeGroupId,
  onPickAskOption,
  busy,
}: {
  message: ChatMessage;
  documents: ManifestEntry[];
  artifactsByGroup: Map<string, ArtifactAttachment>;
  onOpenSource: (doc: string, page: number, attach?: SourceAttachment | null) => void;
  onOpenArtifact: (groupId: string, version?: number) => void;
  activeGroupId: string | null;
  onPickAskOption: (text: string) => void;
  busy: boolean;
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[78%] rounded-2xl rounded-br-sm bg-primary px-4 py-2 text-sm text-primary-foreground whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    );
  }

  const stillWorking =
    message.streaming ||
    message.toolChips.some((c) => c.status === "running");

  return (
    <div className="flex justify-start animate-fade-in">
      <div className="w-full max-w-full">
        <ToolChipRow chips={message.toolChips} />
        {!message.content && stillWorking && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            thinking
          </div>
        )}
        {message.content && (
          <CitationText
            text={message.content}
            documents={documents}
            onCite={onOpenSource}
          />
        )}
        {message.sources.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {message.sources.map((s, i) => (
              <SourceCard
                key={i}
                source={s}
                onOpen={(doc, page) => onOpenSource(doc, page, s)}
              />
            ))}
          </div>
        )}
        {(() => {
          const pendingArtifactChips = message.toolChips.filter(
            (c) =>
              c.name.endsWith("emit_artifact") &&
              c.status === "running" &&
              message.artifactGroups.length === 0,
          );
          const hasContent =
            message.artifactGroups.length > 0 || pendingArtifactChips.length > 0;
          if (!hasContent) return null;
          return (
            <div className="mt-2 space-y-1.5">
              {pendingArtifactChips.map((c) => (
                <PendingArtifactCard key={`pending-${c.id}`} chip={c} />
              ))}
              {message.artifactGroups.map((gid) => {
                const a = artifactsByGroup.get(gid);
                if (!a) return null;
                return (
                  <ArtifactCard
                    key={gid}
                    artifact={a}
                    active={activeGroupId === gid}
                    onOpen={(version) => onOpenArtifact(gid, version)}
                  />
                );
              })}
            </div>
          );
        })()}
        {message.ask && (
          <div className="mt-2">
            <AskBlock
              ask={message.ask}
              onAnswer={(t) => onPickAskOption(t)}
              disabled={busy}
            />
          </div>
        )}
      </div>
    </div>
  );
}

async function consumeSSE(body: ReadableStream<Uint8Array>, onEvent: (e: any) => void) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      let dataStr = "";
      for (const line of chunk.split("\n")) {
        if (line.startsWith("data: ")) dataStr += line.slice(6);
      }
      if (!dataStr) continue;
      try {
        onEvent(JSON.parse(dataStr));
      } catch {
        // ignore parse errors
      }
    }
  }
}
