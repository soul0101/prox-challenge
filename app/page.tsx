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
import {
  RightPanelTabs,
  type RightTabDescriptor,
} from "@/components/shell/RightPanelTabs";
import { LogoMark } from "@/components/ui/LogoMark";
import type { Manifest } from "@/lib/kb/types";
import type {
  ArtifactAttachment,
  ChatMessage,
  SourceAttachment,
} from "@/lib/client/chat-types";
import { activeVersion } from "@/lib/client/chat-types";
import { ease } from "@/lib/ui/motion";

/**
 * A single tab in the right-side panel. Multiple artifact tabs can coexist
 * (one per `group_id`); the source viewer is a singleton (opening a new
 * page replaces the current source tab rather than stacking).
 */
type OpenTab =
  | {
      key: string;
      kind: "artifact";
      groupId: string;
      /** User-chosen version for this tab; null means "follow latest". */
      pickedVersion: number | null;
    }
  | {
      key: string;
      kind: "source";
      doc: string;
      page: number;
      bbox: [number, number, number, number] | null;
    };

const SOURCE_TAB_KEY = "source";
const artifactTabKey = (groupId: string) => `artifact:${groupId}`;

export default function Home() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([]);
  const [activeTabKey, setActiveTabKey] = useState<string | null>(null);
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

  // When the active thread changes, clear all right-panel tabs — they belong
  // to the previous thread and their group_ids won't resolve in the new one.
  useEffect(() => {
    setOpenTabs([]);
    setActiveTabKey(null);
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

  const openSource = useCallback(
    (doc: string, page: number, attach?: SourceAttachment | null) => {
      const bbox = attach?.bbox || null;
      setOpenTabs((tabs) => {
        const others = tabs.filter((t) => t.kind !== "source");
        const next: OpenTab = { key: SOURCE_TAB_KEY, kind: "source", doc, page, bbox };
        return [...others, next];
      });
      setActiveTabKey(SOURCE_TAB_KEY);
    },
    [],
  );

  const openArtifact = useCallback((groupId: string, version?: number) => {
    const key = artifactTabKey(groupId);
    setOpenTabs((tabs) => {
      const existing = tabs.find((t) => t.key === key);
      if (existing && existing.kind === "artifact") {
        // Reuse the tab — only update the picked version if caller supplied one.
        if (version == null || existing.pickedVersion === version) return tabs;
        return tabs.map((t) =>
          t.key === key && t.kind === "artifact"
            ? { ...t, pickedVersion: version }
            : t,
        );
      }
      return [
        ...tabs,
        { key, kind: "artifact", groupId, pickedVersion: version ?? null },
      ];
    });
    setActiveTabKey(key);
  }, []);

  const closeTab = useCallback((key: string) => {
    setOpenTabs((tabs) => {
      const idx = tabs.findIndex((t) => t.key === key);
      if (idx === -1) return tabs;
      const next = tabs.filter((t) => t.key !== key);
      setActiveTabKey((active) => {
        if (active !== key) return active;
        if (next.length === 0) return null;
        // Prefer the tab that slid into this slot; fall back to the last one.
        return next[Math.min(idx, next.length - 1)].key;
      });
      return next;
    });
  }, []);

  const pickArtifactVersion = useCallback(
    (groupId: string, version: number) => {
      const key = artifactTabKey(groupId);
      setOpenTabs((tabs) =>
        tabs.map((t) =>
          t.key === key && t.kind === "artifact"
            ? { ...t, pickedVersion: version }
            : t,
        ),
      );
    },
    [],
  );

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
      // Open (or reuse) the tab for this group and pop it to the front of
      // the user's attention. Pass `undefined` version so the tab follows
      // "latest" rather than pinning to whichever version just arrived.
      openArtifact(groupId);
      callback?.(groupId);
    },
    [threadOps, openArtifact],
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

  // Resolve the currently-active tab into its payload.
  const activeTab = openTabs.find((t) => t.key === activeTabKey) || null;

  // If the active tab is an artifact but the underlying group has been
  // garbage-collected (e.g., thread reset race), drop the tab silently.
  let rightKey: string | null = null;
  let rightNode: React.ReactNode = null;

  if (activeTab?.kind === "artifact") {
    const att = artifactsByGroup.get(activeTab.groupId);
    if (att) {
      const latest = att.versions[att.versions.length - 1].version;
      const withVersion: ArtifactAttachment = {
        ...att,
        current_version: activeTab.pickedVersion ?? latest,
      };
      rightKey = activeTab.key;
      rightNode = (
        <ArtifactPanel
          artifact={withVersion}
          onClose={() => closeTab(activeTab.key)}
          onPickVersion={(gid, version) => pickArtifactVersion(gid, version)}
          onError={requestArtifactFix}
        />
      );
    }
  } else if (activeTab?.kind === "source") {
    rightKey = `${activeTab.key}:${activeTab.doc}:${activeTab.page}`;
    rightNode = (
      <SourceViewer
        manifest={manifest.documents}
        open={true}
        activeDoc={activeTab.doc}
        activePage={activeTab.page}
        highlightBbox={activeTab.bbox}
        onClose={() => closeTab(activeTab.key)}
        onNavigate={(doc, page) => openSource(doc, page, null)}
      />
    );
  }

  // Build a descriptor per open tab for the strip.
  const tabDescriptors: RightTabDescriptor[] = openTabs.map((t) => {
    if (t.kind === "artifact") {
      const att = artifactsByGroup.get(t.groupId);
      const latest = att?.versions[att.versions.length - 1].version;
      const v = att
        ? activeVersion({
            ...att,
            current_version: t.pickedVersion ?? latest!,
          })
        : null;
      return {
        key: t.key,
        kind: "artifact",
        label: v?.title || "Artifact",
        sublabel: v && att ? `v${v.version}/${att.versions.length}` : null,
        artifactKind: v?.kind,
      };
    }
    const docEntry = manifest.documents.find((d) => d.slug === t.doc);
    return {
      key: t.key,
      kind: "source",
      label: docEntry?.title || t.doc,
      sublabel: `p.${t.page}`,
    };
  });

  const activeArtifactGroupId =
    activeTab?.kind === "artifact" ? activeTab.groupId : null;

  const tabStrip =
    tabDescriptors.length > 0 ? (
      <RightPanelTabs
        tabs={tabDescriptors}
        activeKey={activeTabKey}
        onSelect={setActiveTabKey}
        onClose={closeTab}
      />
    ) : null;

  return (
    <AppShell
      rightKey={rightKey}
      right={rightNode}
      tabs={tabStrip}
      // Mobile swipe-down / scrim tap dismisses the sheet without destroying
      // the user's open tabs — they can re-open any by tapping its inline
      // card. The explicit × in tab strip or panel header still closes tabs.
      onCloseRight={() => setActiveTabKey(null)}
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
              activeGroupId={activeArtifactGroupId}
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

