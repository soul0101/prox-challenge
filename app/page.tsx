"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChatPanel, type ChatPanelHandle } from "@/components/chat/ChatPanel";
import { ArtifactPanel } from "@/components/artifact/Panel";
import { SourceViewer } from "@/components/source/Viewer";
import { LibraryDrawer } from "@/components/library/Drawer";
import type { Manifest } from "@/lib/kb/types";
import type { ArtifactAttachment, SourceAttachment } from "@/lib/client/chat-types";

export default function Home() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [artifactsByGroup, setArtifactsByGroup] = useState<
    Map<string, ArtifactAttachment>
  >(() => new Map());
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [activeVersion, setActiveVersion] = useState<number | null>(null);
  const [sourceDoc, setSourceDoc] = useState<string | null>(null);
  const [sourcePage, setSourcePage] = useState<number | null>(null);
  const [sourceBbox, setSourceBbox] = useState<
    [number, number, number, number] | null
  >(null);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);

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

      const codeExcerpt = code.length > 1500 ? code.slice(0, 1500) + "\n…[truncated]" : code;
      const msg = `[auto-fix request] The artifact you just emitted (group_id="${groupId}", v${version}) failed to render in the sandbox with this error:

\`\`\`
${errorMsg}
\`\`\`

Please call \`emit_artifact\` AGAIN with the SAME \`group_id="${groupId}"\` so the UI stacks it as v${version + 1} of the same card. Common pitfalls that cause sucrase/JSX failures:
- Apostrophes inside single-quoted JS strings (use double quotes, or escape with \\').
- Unescaped curly braces or angle brackets inside JSX text.
- Missing closing tags like </div>, </ul>, </span>.
- Truncated identifiers / dropped characters in symbol names (e.g. "ntilation" instead of "ventilation").
- JSX elements missing the self-closing slash (e.g. <Icon /> not <Icon>).

For reference, the failing source was:

\`\`\`tsx
${codeExcerpt}
\`\`\`

Re-emit a corrected, complete artifact. Validate every JSX tag has a matching close, every string is properly quoted, and every identifier is spelled consistently.`;

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
  }, []);

  const openArtifact = useCallback((groupId: string, version?: number) => {
    setActiveGroupId(groupId);
    setActiveVersion(version ?? null);
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
      setArtifactsByGroup((prev) => {
        const next = new Map(prev);
        const existing = next.get(groupId);
        if (existing) {
          const version = existing.versions.length + 1;
          const updated: ArtifactAttachment = {
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
          next.set(groupId, updated);
        } else {
          next.set(groupId, {
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
          });
        }
        return next;
      });
      // Auto-open the latest version.
      setActiveGroupId(groupId);
      setActiveVersion(null);
      callback?.(groupId);
    },
    [],
  );

  if (!manifest) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
        Loading knowledge base…
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

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <div className="flex flex-1 min-w-0 flex-col">
        {manifest.documents.length === 0 && (
          <div className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-red-200">
            No documents ingested. {loadError && `Error: ${loadError}. `}
            Drop PDFs into <code className="rounded bg-secondary px-1">files/</code> and run{" "}
            <code className="rounded bg-secondary px-1">npm run ingest</code>.
          </div>
        )}
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
          />
        </div>
      </div>

      {showArtifact && (
        <div className="w-[560px] min-w-[360px] max-w-[55%] shrink-0">
          <ArtifactPanel
            artifact={activeArtifactWithVersion}
            onClose={() => {
              setActiveGroupId(null);
              setActiveVersion(null);
            }}
            onPickVersion={(_, version) => setActiveVersion(version)}
            onError={requestArtifactFix}
          />
        </div>
      )}

      {showSource && (
        <div className="w-[440px] min-w-[320px] max-w-[40%] shrink-0">
          <SourceViewer
            manifest={manifest.documents}
            open={sourceOpen}
            activeDoc={sourceDoc}
            activePage={sourcePage}
            highlightBbox={sourceBbox}
            onClose={() => setSourceOpen(false)}
            onNavigate={(doc, page) => openSource(doc, page, null)}
          />
        </div>
      )}

      <LibraryDrawer
        manifest={manifest.documents}
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        onOpenPage={(doc, page) => {
          openSource(doc, page);
          setLibraryOpen(false);
        }}
      />
    </div>
  );
}
