"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChatPanel, type ChatPanelHandle } from "@/components/chat/ChatPanel";
import { ArtifactPanel } from "@/components/artifact/Panel";
import { SourceViewer } from "@/components/source/Viewer";
import { LibraryDrawer } from "@/components/library/Drawer";
import { SettingsDialog } from "@/components/settings/SettingsDialog";
import { ThreadSidebar } from "@/components/threads/ThreadSidebar";
import { MemoryDialog, MemoryToast } from "@/components/memory/MemoryDialog";
import { hasOnboarded, markOnboarded, useSettings } from "@/lib/client/settings";
import {
  deriveTitle,
  fromChatMessage,
  toChatMessage,
  useThreads,
} from "@/lib/client/threads";
import { factsAsLines, useUserMemory } from "@/lib/client/memory";
import { AppShell } from "@/components/shell/AppShell";
import { LogoMark } from "@/components/ui/LogoMark";
import { FileText, Sparkles } from "lucide-react";
import type { Manifest } from "@/lib/kb/types";
import type {
  ArtifactAttachment,
  ChatMessage,
  SourceAttachment,
} from "@/lib/client/chat-types";
import { ease } from "@/lib/ui/motion";
import { cn } from "@/lib/utils";

export default function Home() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [activeVersion, setActiveVersion] = useState<number | null>(null);
  const [sourceDoc, setSourceDoc] = useState<string | null>(null);
  const [sourcePage, setSourcePage] = useState<number | null>(null);
  const [sourceBbox, setSourceBbox] = useState<
    [number, number, number, number] | null
  >(null);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [threadsOpen, setThreadsOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [recentAutoFacts, setRecentAutoFacts] = useState<string[]>([]);
  const [isFirstVisit, setIsFirstVisit] = useState(false);
  const [settings, updateSettings, resetSettings] = useSettings();
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);
  const [threadsState, threadOps, activeThread] = useThreads();
  const [memory, memoryOps] = useUserMemory();
  const memoryLines = useMemo(() => factsAsLines(memory), [memory]);

  // Guarantee there is always an active thread once the manifest is loaded,
  // so a first-time user can start chatting without clicking "new".
  useEffect(() => {
    if (!manifest) return;
    if (activeThread) return;
    if (threadsState.threads.length === 0) {
      threadOps.create();
    } else {
      threadOps.setActive(threadsState.threads[0].id);
    }
  }, [manifest, activeThread, threadsState.threads, threadOps]);

  const artifactsByGroup = useMemo<Map<string, ArtifactAttachment>>(() => {
    const src = activeThread?.artifacts ?? {};
    return new Map(Object.entries(src));
  }, [activeThread?.artifacts]);

  // When the active thread changes, clear the right-panel view state so we
  // don't keep pointing at an artifact that belongs to the previous thread.
  useEffect(() => {
    setActiveGroupId(null);
    setActiveVersion(null);
    setSourceOpen(false);
    setSourceDoc(null);
    setSourcePage(null);
    setSourceBbox(null);
  }, [activeThread?.id]);

  // Lazy ref for callbacks that run outside render (artifact events, turn
  // completion). Within render, use `activeThread` directly.
  const activeThreadRef = useRef(activeThread);
  useEffect(() => {
    activeThreadRef.current = activeThread;
  });

  // Only re-hydrate when the thread CHANGES (new id). We deliberately ignore
  // in-place message mutations so ChatPanel's live state isn't clobbered
  // mid-turn.
  const initialMessages = useMemo<ChatMessage[]>(
    () => (activeThread ? activeThread.messages.map(toChatMessage) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeThread?.id],
  );

  // First-visit: auto-open settings so the user configures the API key and
  // models before their first request. We flip the onboarded flag the moment
  // they close the dialog, so reloading never re-triggers it.
  useEffect(() => {
    if (!hasOnboarded()) {
      setIsFirstVisit(true);
      setSettingsOpen(true);
    }
  }, []);

  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
    if (isFirstVisit) {
      markOnboarded();
      setIsFirstVisit(false);
    }
  }, [isFirstVisit]);
  /** Which right-panel the user last interacted with. Decides precedence when
   *  both an artifact and a source happen to be active at the same time. */
  const [rightPreference, setRightPreference] = useState<"artifact" | "source">(
    "artifact",
  );

  const chatRef = useRef<ChatPanelHandle>(null);
  // Track which (group_id, version) pairs we've already auto-fixed, so a
  // chronically broken artifact doesn't loop forever. Cap = 2 fix attempts
  // per group total.
  const fixAttempts = useRef<Map<string, number>>(new Map());

  const requestArtifactFix = useCallback(
    (groupId: string, version: number, errorMsg: string, code: string) => {
      const attempts = fixAttempts.current.get(groupId) || 0;
      if (attempts >= 2) return; // give up — user can intervene manually
      fixAttempts.current.set(groupId, attempts + 1);

      const msg = `[auto-fix request] The artifact (group_id="${groupId}", v${version}) failed to render with this error:

\`\`\`
${errorMsg}
\`\`\`

Call \`emit_artifact\` again with the SAME \`group_id="${groupId}"\` so it stacks as v${version + 1}. Pass the error above verbatim as the \`error_context\` argument, and restate the spec (you can reuse the prior spec or refine it). The artifact author will diagnose the syntax issue and produce a corrected version — you don't need to fix the code yourself.`;

      chatRef.current?.submit(msg);
    },
    [],
  );

  useEffect(() => {
    fetch("/api/manifest")
      .then((r) => r.json())
      .then((m: Manifest & { error?: string }) => {
        if (m.error) setLoadError(m.error);
        setManifest(m);
      })
      .catch((e) => setLoadError(String(e.message || e)));
  }, []);

  const openSource = useCallback((doc: string, page: number, attach?: SourceAttachment | null) => {
    setSourceDoc(doc);
    setSourcePage(page);
    setSourceBbox(attach?.bbox || null);
    setSourceOpen(true);
    setRightPreference("source");
  }, []);

  const openArtifact = useCallback((groupId: string, version?: number) => {
    setActiveGroupId(groupId);
    setActiveVersion(version ?? null);
    setRightPreference("artifact");
  }, []);

  const onArtifactEvent = useCallback(
    (
      e: {
        id: string;
        kind: ArtifactAttachment["versions"][number]["kind"];
        title: string;
        code: string;
        group_id?: string;
        version_note?: string;
      },
      callback?: (groupId: string) => void,
    ) => {
      const groupId = e.group_id || e.id;
      const ts = Date.now();
      const current = activeThreadRef.current;
      if (!current) return;
      const existing = current.artifacts[groupId];
      let updated: ArtifactAttachment;
      if (existing) {
        const version = existing.versions.length + 1;
        updated = {
          ...existing,
          current_version: version,
          versions: [
            ...existing.versions,
            {
              id: e.id,
              kind: e.kind,
              title: e.title,
              code: e.code,
              version,
              note: e.version_note,
              ts,
            },
          ],
        };
      } else {
        updated = {
          group_id: groupId,
          current_version: 1,
          versions: [
            {
              id: e.id,
              kind: e.kind,
              title: e.title,
              code: e.code,
              version: 1,
              note: e.version_note,
              ts,
            },
          ],
        };
      }
      threadOps.updateActive({
        artifacts: { ...current.artifacts, [groupId]: updated },
      });
      setActiveGroupId(groupId);
      setActiveVersion(null);
      setRightPreference("artifact");
      callback?.(groupId);
    },
    [threadOps],
  );

  const onTurnComplete = useCallback(
    ({
      messages,
      lastUser,
      lastAssistant,
    }: {
      messages: ChatMessage[];
      lastUser: string;
      lastAssistant: string;
    }) => {
      const current = activeThreadRef.current;
      if (!current) return;

      const stored = messages.map(fromChatMessage);
      const titlePatch =
        current.title === "New chat" && stored.length > 0
          ? { title: deriveTitle(stored) }
          : {};
      threadOps.updateActive({ messages: stored, ...titlePatch });

      if (!lastUser.trim() || !lastAssistant.trim()) return;

      const existing = memoryLines;
      const apiKey = settingsRef.current.apiKey || undefined;

      // Fire-and-forget memory extraction. Never blocks the user.
      fetch("/api/memory/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey,
          existing,
          user: lastUser,
          assistant: lastAssistant,
        }),
      })
        .then((r) => r.json())
        .then((json) => {
          if (json?.error) {
            console.warn("[memory] extraction error:", json.error, json.raw || "");
          }
          if (!json || !Array.isArray(json.facts)) return;
          const newFacts = memoryOps.replaceAuto(json.facts as string[]);
          if (newFacts.length > 0) {
            setRecentAutoFacts(newFacts.map((f) => f.text));
          }
        })
        .catch((err) => {
          console.warn("[memory] extraction failed:", err);
        });
    },
    [memoryLines, memoryOps, threadOps],
  );

  if (!manifest) {
    return (
      <div className="flex h-screen items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0, transition: { duration: 0.4, ease: ease.smooth } }}
          className="flex flex-col items-center gap-3"
        >
          <LogoMark size={48} animated />
          <div className="flex items-center gap-1.5 font-mono text-xs tracking-wide text-fg-dim">
            <span className="inline-block h-1 w-1 animate-pulse rounded-full bg-primary" />
            <span className="inline-block h-1 w-1 animate-pulse rounded-full bg-primary" style={{ animationDelay: "120ms" }} />
            <span className="inline-block h-1 w-1 animate-pulse rounded-full bg-primary" style={{ animationDelay: "240ms" }} />
            <span className="ml-2">waking up the knowledge base…</span>
          </div>
        </motion.div>
      </div>
    );
  }

  const activeArtifact = activeGroupId
    ? artifactsByGroup.get(activeGroupId) || null
    : null;
  // Resolve the active version to view; latest if none picked.
  const activeArtifactWithVersion: ArtifactAttachment | null = activeArtifact
    ? {
        ...activeArtifact,
        current_version:
          activeVersion ?? activeArtifact.versions[activeArtifact.versions.length - 1].version,
      }
    : null;

  const showArtifact = !!activeArtifactWithVersion;
  const showSource = sourceOpen && sourceDoc !== null && sourcePage !== null;

  // Pick which panel to show. User intent (rightPreference) wins; if the
  // preferred panel isn't available, fall back to the other.
  const bothActive = showArtifact && showSource;
  const showing: "artifact" | "source" | null = (() => {
    if (rightPreference === "source" && showSource) return "source";
    if (rightPreference === "artifact" && showArtifact) return "artifact";
    if (showArtifact) return "artifact";
    if (showSource) return "source";
    return null;
  })();

  let rightKey: string | null = null;
  let rightNode: React.ReactNode = null;
  if (showing === "artifact" && activeArtifactWithVersion) {
    rightKey = `artifact:${activeArtifactWithVersion.group_id}`;
    rightNode = (
      <ArtifactPanel
        artifact={activeArtifactWithVersion}
        onClose={() => {
          setActiveGroupId(null);
          setActiveVersion(null);
        }}
        onPickVersion={(_, version) => setActiveVersion(version)}
        onError={requestArtifactFix}
      />
    );
  } else if (showing === "source") {
    rightKey = `source:${sourceDoc}:${sourcePage}`;
    rightNode = (
      <SourceViewer
        manifest={manifest.documents}
        open={sourceOpen}
        activeDoc={sourceDoc}
        activePage={sourcePage}
        highlightBbox={sourceBbox}
        onClose={() => setSourceOpen(false)}
        onNavigate={(doc, page) => openSource(doc, page, null)}
      />
    );
  }

  // When both are active, wrap the right-panel content with a thin switcher so
  // the user can flip between the artifact and the currently-open source.
  const rightWithSwitcher: React.ReactNode = rightNode && (
    <div className="flex h-full min-w-0 flex-col">
      {bothActive && showing && (
        <RightPanelSwitcher
          active={showing}
          onSelect={setRightPreference}
          artifactTitle={
            activeArtifactWithVersion?.versions.find(
              (v) => v.version === activeArtifactWithVersion.current_version,
            )?.title
          }
          sourceLabel={
            sourceDoc
              ? `${
                  manifest.documents.find((d) => d.slug === sourceDoc)?.title ||
                  sourceDoc
                } · p.${sourcePage}`
              : null
          }
        />
      )}
      <div className="min-h-0 flex-1">{rightNode}</div>
    </div>
  );

  return (
    <AppShell
      rightKey={rightKey}
      right={rightWithSwitcher}
      chat={
        <>
          <AnimatePresence>
            {manifest.documents.length === 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden border-b border-destructive/40 bg-destructive/10 px-4 py-2 text-xs text-red-200"
              >
                No documents ingested. {loadError && `Error: ${loadError}. `}
                Drop PDFs into <code className="mx-0.5 rounded bg-surface-2 px-1 font-mono">files/</code> and run{" "}
                <code className="mx-0.5 rounded bg-surface-2 px-1 font-mono">npm run ingest</code>.
              </motion.div>
            )}
          </AnimatePresence>
          <div className="min-h-0 flex-1">
            <ChatPanel
              ref={chatRef}
              manifest={manifest}
              artifactsByGroup={artifactsByGroup}
              onOpenSource={openSource}
              onArtifactEvent={onArtifactEvent}
              onOpenArtifact={openArtifact}
              activeGroupId={activeGroupId}
              onOpenLibrary={() => setLibraryOpen(true)}
              onOpenSettings={() => setSettingsOpen(true)}
              onOpenThreads={() => setThreadsOpen(true)}
              onOpenMemory={() => setMemoryOpen(true)}
              threadKey={activeThread?.id ?? null}
              initialMessages={initialMessages}
              memory={memoryLines}
              onTurnComplete={onTurnComplete}
              threadCount={threadsState.threads.length}
              memoryCount={memory.facts.length}
            />
          </div>
        </>
      }
      overlays={
        <>
          <LibraryDrawer
            manifest={manifest.documents}
            open={libraryOpen}
            onClose={() => setLibraryOpen(false)}
            onOpenPage={(doc, page) => {
              openSource(doc, page);
              setLibraryOpen(false);
            }}
          />
          <ThreadSidebar
            open={threadsOpen}
            threads={threadsState.threads}
            activeId={threadsState.activeId}
            onClose={() => setThreadsOpen(false)}
            onCreate={() => threadOps.create()}
            onSelect={(id) => threadOps.setActive(id)}
            onRename={threadOps.rename}
            onDelete={threadOps.remove}
            onOpenMemory={() => {
              setThreadsOpen(false);
              setMemoryOpen(true);
            }}
            memoryCount={memory.facts.length}
          />
          <MemoryDialog
            open={memoryOpen}
            memory={memory}
            onClose={() => setMemoryOpen(false)}
            onAdd={(text) => memoryOps.add(text, "manual")}
            onUpdate={memoryOps.update}
            onRemove={memoryOps.remove}
            onClear={memoryOps.clear}
          />
          <MemoryToast
            facts={recentAutoFacts}
            onDismiss={() => setRecentAutoFacts([])}
          />
          <SettingsDialog
            open={settingsOpen}
            firstVisit={isFirstVisit}
            settings={settings}
            onClose={closeSettings}
            onUpdate={updateSettings}
            onReset={resetSettings}
          />
        </>
      }
    />
  );
}

function RightPanelSwitcher({
  active,
  onSelect,
  artifactTitle,
  sourceLabel,
}: {
  active: "artifact" | "source";
  onSelect: (k: "artifact" | "source") => void;
  artifactTitle?: string | null;
  sourceLabel?: string | null;
}) {
  const tabs: {
    key: "artifact" | "source";
    Icon: React.ComponentType<{ className?: string }>;
    label: string;
    sub: string | null;
  }[] = [
    { key: "artifact", Icon: Sparkles, label: "Artifact", sub: artifactTitle || null },
    { key: "source", Icon: FileText, label: "Source", sub: sourceLabel || null },
  ];
  return (
    <div className="flex items-center gap-1 border-b border-border-subtle bg-surface-1/70 px-2 py-1.5 backdrop-blur-md">
      {tabs.map(({ key, Icon, label, sub }) => {
        const isActive = active === key;
        return (
          <button
            key={key}
            onClick={() => onSelect(key)}
            className={cn(
              "group relative inline-flex min-w-0 max-w-[50%] flex-1 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-colors",
              isActive
                ? "border-primary/50 bg-primary/10 text-fg"
                : "border-border-subtle bg-surface-2/50 text-fg-muted hover:bg-surface-3/60 hover:text-fg",
            )}
          >
            <Icon
              className={cn(
                "h-3.5 w-3.5 shrink-0",
                isActive ? "text-primary" : "text-fg-dim",
              )}
            />
            <div className="min-w-0">
              <div className="truncate text-[11.5px] font-medium">{label}</div>
              {sub && (
                <div className="truncate font-mono text-[10px] text-fg-dim">
                  {sub}
                </div>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
