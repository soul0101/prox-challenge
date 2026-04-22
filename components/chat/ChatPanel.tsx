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
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import {
  BookOpen,
  Brain,
  MessageSquare,
  Settings as SettingsIcon,
} from "lucide-react";
import { toPayload, useSettings } from "@/lib/client/settings";
import type { Manifest, ManifestEntry } from "@/lib/kb/types";
import type {
  ArtifactAttachment,
  ChatMessage,
  SourceAttachment,
  ToolChip,
} from "@/lib/client/chat-types";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/ui/LogoMark";
import { ToolChipRow } from "./ToolChipRow";
import { CitationText } from "./CitationText";
import { SourceCard } from "./SourceCard";
import { ArtifactCard } from "./ArtifactCard";
import { PendingArtifactCard } from "./PendingArtifactCard";
import { AskBlock } from "./AskBlock";
import { Composer } from "./Composer";
import { ThinkingIndicator } from "./ThinkingIndicator";
import { ScrollToLatest } from "./ScrollToLatest";
import { WelcomeHero } from "./WelcomeHero";
import { ease, fadeUp } from "@/lib/ui/motion";
import { cn } from "@/lib/utils";

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
  onOpenSettings: () => void;
  onOpenThreads: () => void;
  onOpenMemory: () => void;
  /** Stable key for the active thread. Changing it resets the chat. */
  threadKey: string | null;
  /** Messages to hydrate on mount / thread switch. */
  initialMessages: ChatMessage[];
  /** Stable facts injected into the system prompt server-side. */
  memory: string[];
  /** Fired when a turn completes (successful or aborted). */
  onTurnComplete?: (args: {
    messages: ChatMessage[];
    lastUser: string;
    lastAssistant: string;
  }) => void;
  threadCount: number;
  memoryCount: number;
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
    onOpenSettings,
    onOpenThreads,
    onOpenMemory,
    threadKey,
    initialMessages,
    memory,
    onTurnComplete,
    threadCount,
    memoryCount,
  }: Props,
  ref,
) {
  const [settings] = useSettings();
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);
  const memoryRef = useRef(memory);
  useEffect(() => {
    memoryRef.current = memory;
  }, [memory]);
  const onTurnCompleteRef = useRef(onTurnComplete);
  useEffect(() => {
    onTurnCompleteRef.current = onTurnComplete;
  }, [onTurnComplete]);

  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showScrollFab, setShowScrollFab] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoStickRef = useRef(true);

  // Hydrate (and reset) when the active thread changes. Any in-flight stream
  // is aborted so it doesn't write into the newly-swapped-in thread.
  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages(initialMessages);
    setInput("");
    setError(null);
    setBusy(false);
    autoStickRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadKey]);

  const prompts = useMemo(() => {
    const picks: { label: string; text: string }[] = [];
    for (const d of manifest.documents) {
      for (const p of d.map.suggested_prompts.slice(0, 2)) {
        picks.push({ label: p, text: p });
      }
    }
    return picks.slice(0, 6);
  }, [manifest.documents]);

  // Auto-scroll on message change when user is anchored to the bottom.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (autoStickRef.current) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [messages]);

  // Track whether the user has scrolled up — drives the "scroll to latest" FAB.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      const atBottom = distFromBottom < 80;
      autoStickRef.current = atBottom;
      setShowScrollFab(distFromBottom > 220);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    autoStickRef.current = true;
  }, []);

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
      autoStickRef.current = true;

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
            memory: memoryRef.current,
            ...toPayload(settingsRef.current),
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
        // Persist + extract memory. Read latest messages via the functional
        // setter so we capture everything the stream appended.
        setMessages((ms) => {
          const lastUser = [...ms].reverse().find((m) => m.role === "user");
          const lastAsst = [...ms].reverse().find((m) => m.role === "assistant");
          onTurnCompleteRef.current?.({
            messages: ms,
            lastUser: lastUser?.content || "",
            lastAssistant: lastAsst?.content || "",
          });
          return ms;
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          updateLast((m) => {
            const incoming = String(e.text || "");
            if (incoming.length >= m.content.length) return { ...m, content: incoming };
            return m;
          });
          break;
        case "tool_start": {
          const id = String(e.id);
          updateLast((m) => {
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

  const placeholders = useMemo(() => prompts.map((p) => p.text).slice(0, 3), [prompts]);
  const docCount = manifest.documents.length;
  const pageCount = manifest.documents.reduce((s, d) => s + d.page_count, 0);

  return (
    <div className="relative flex h-full flex-col">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-border-subtle bg-background/70 backdrop-blur-xl">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 items-center gap-1.5">
            <button
              onClick={onOpenThreads}
              className="relative grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border-subtle bg-surface-2 text-fg-muted shadow-soft transition-colors hover:bg-surface-3 hover:text-fg"
              aria-label="Conversations"
              title="Conversations"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              {threadCount > 0 && (
                <span className="absolute -right-1 -top-1 grid h-4 min-w-[16px] place-items-center rounded-full border border-background bg-primary px-1 font-mono text-[9px] text-primary-foreground">
                  {threadCount > 99 ? "99+" : threadCount}
                </span>
              )}
            </button>
            <div className="relative grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border-subtle bg-surface-2 shadow-soft">
              <LogoMark size={20} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-semibold tracking-tight text-fg">
                  Manual Copilot
                </span>
                <StatusDot busy={busy} error={!!error} />
              </div>
              <div className="truncate font-mono text-[10.5px] text-fg-dim">
                {docCount} doc{docCount !== 1 ? "s" : ""} · {pageCount.toLocaleString()} pages
                {manifest.documents[0] ? ` · ${manifest.documents[0].title}` : ""}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={onOpenMemory}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[11.5px] font-medium transition-colors",
                memoryCount > 0
                  ? "border-primary/40 bg-primary/10 text-fg hover:bg-primary/20"
                  : "border-border-subtle bg-surface-2 text-fg-muted hover:bg-surface-3 hover:text-fg",
              )}
              aria-label="Memory"
              title="What the assistant remembers about you"
            >
              <Brain className="h-3.5 w-3.5" />
              <span>Memory</span>
              {memoryCount > 0 && (
                <span className="rounded-full bg-primary/20 px-1.5 py-0.5 font-mono text-[9.5px] text-primary">
                  {memoryCount}
                </span>
              )}
            </button>
            <Button variant="outline" size="sm" onClick={onOpenLibrary}>
              <BookOpen className="h-3.5 w-3.5" /> Library
            </Button>
            <button
              onClick={onOpenSettings}
              className="grid h-8 w-8 place-items-center rounded-lg border border-border-subtle bg-surface-2 text-fg-dim transition-colors hover:bg-surface-3 hover:text-fg"
              aria-label="Open settings"
              title="Settings"
            >
              <SettingsIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Thread */}
      <div
        ref={scrollRef}
        className="relative flex-1 overflow-y-auto scrollbar-thin"
      >
        <div className="mx-auto w-full max-w-3xl px-4 pb-40 pt-6">
          {messages.length === 0 && (
            <WelcomeHero
              documents={manifest.documents}
              suggestions={prompts}
              onPick={(t) => submit(t)}
            />
          )}
          <LayoutGroup>
            <div className="space-y-6">
              {messages.map((m, i) => (
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
                  isLastAssistant={
                    m.role === "assistant" && i === messages.length - 1
                  }
                />
              ))}
            </div>
          </LayoutGroup>
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-red-300"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <ScrollToLatest visible={showScrollFab} onClick={scrollToBottom} />
      </div>

      {/* Composer */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10">
        <div className="pointer-events-none h-10 bg-gradient-to-b from-transparent to-background" />
        <div className="pointer-events-auto bg-background/60 backdrop-blur-md">
          <Composer
            value={input}
            onChange={setInput}
            onSubmit={(v) => submit(v)}
            onStop={stop}
            onVoiceTranscript={(t) => submit(t)}
            placeholders={placeholders}
            busy={busy}
          />
        </div>
      </div>
    </div>
  );
});

function StatusDot({ busy, error }: { busy: boolean; error: boolean }) {
  const color = error
    ? "bg-destructive"
    : busy
      ? "bg-amber-400"
      : "bg-emerald-400";
  const label = error ? "error" : busy ? "thinking" : "ready";
  return (
    <span
      className="inline-flex items-center gap-1 font-mono text-[9.5px] uppercase tracking-wide text-fg-dim"
      title={label}
    >
      <span className="relative inline-flex">
        <span className={cn("block h-1.5 w-1.5 rounded-full", color)} />
        {(busy || error) && (
          <span
            className={cn(
              "absolute inset-0 animate-ping rounded-full opacity-70",
              color,
            )}
          />
        )}
      </span>
      {label}
    </span>
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
  isLastAssistant,
}: {
  message: ChatMessage;
  documents: ManifestEntry[];
  artifactsByGroup: Map<string, ArtifactAttachment>;
  onOpenSource: (doc: string, page: number, attach?: SourceAttachment | null) => void;
  onOpenArtifact: (groupId: string, version?: number) => void;
  activeGroupId: string | null;
  onPickAskOption: (text: string) => void;
  busy: boolean;
  isLastAssistant: boolean;
}) {
  if (message.role === "user") {
    return (
      <motion.div
        layout="position"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0, transition: { duration: 0.24, ease: ease.smooth } }}
        className="flex justify-end"
      >
        <div className="group relative max-w-[82%]">
          <div className="whitespace-pre-wrap rounded-3xl rounded-br-lg bg-gradient-to-br from-primary to-primary/85 px-4 py-2.5 text-[14px] leading-relaxed text-primary-foreground shadow-brand ring-1 ring-white/10">
            {message.content}
          </div>
        </div>
      </motion.div>
    );
  }

  const stillWorking =
    message.streaming || message.toolChips.some((c) => c.status === "running");
  const hasAttachments =
    message.sources.length > 0 ||
    message.artifactGroups.length > 0 ||
    !!message.ask ||
    message.toolChips.some((c) => c.name.endsWith("emit_artifact"));

  return (
    <motion.div
      layout="position"
      variants={fadeUp}
      initial="hidden"
      animate="show"
      className="flex justify-start gap-3"
    >
      <div className="mt-0.5 shrink-0">
        <AssistantAvatar streaming={stillWorking && isLastAssistant} />
      </div>
      <div className="min-w-0 flex-1">
        <ToolChipRow chips={message.toolChips} />
        {!message.content && stillWorking && (
          <ThinkingIndicator chips={message.toolChips} />
        )}
        {message.content && (
          <div
            className={cn(
              hasAttachments &&
                "rounded-2xl border border-border-subtle bg-surface-1/50 px-4 py-3",
            )}
          >
            <CitationText
              text={message.content}
              documents={documents}
              onCite={onOpenSource}
            />
          </div>
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
            <div className="mt-2.5 space-y-1.5">
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
          <div className="mt-2.5">
            <AskBlock
              ask={message.ask}
              onAnswer={(t) => onPickAskOption(t)}
              disabled={busy}
            />
          </div>
        )}
      </div>
    </motion.div>
  );
}

function AssistantAvatar({ streaming }: { streaming: boolean }) {
  return (
    <div className="relative grid h-7 w-7 place-items-center">
      {streaming && (
        <>
          <span className="absolute inset-0 animate-ping rounded-full bg-primary/30" />
          <span className="absolute inset-0 rounded-full bg-primary/10" />
        </>
      )}
      <div
        className={cn(
          "relative grid h-7 w-7 place-items-center rounded-full border",
          streaming
            ? "border-primary/60 bg-surface-2"
            : "border-border-subtle bg-surface-1",
        )}
      >
        <LogoMark size={14} />
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
