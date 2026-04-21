"use client";
import { useEffect, useState } from "react";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { ArtifactPanel } from "@/components/artifact/Panel";
import { SourceViewer } from "@/components/source/Viewer";
import { LibraryDrawer } from "@/components/library/Drawer";
import type { Manifest } from "@/lib/kb/types";
import type { ArtifactAttachment } from "@/lib/client/chat-types";

export default function Home() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeArtifact, setActiveArtifact] = useState<ArtifactAttachment | null>(null);
  const [sourceDoc, setSourceDoc] = useState<string | null>(null);
  const [sourcePage, setSourcePage] = useState<number | null>(null);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);

  useEffect(() => {
    fetch("/api/manifest")
      .then((r) => r.json())
      .then((m: Manifest & { error?: string }) => {
        if (m.error) setLoadError(m.error);
        setManifest(m);
      })
      .catch((e) => setLoadError(String(e.message || e)));
  }, []);

  const openSource = (doc: string, page: number) => {
    setSourceDoc(doc);
    setSourcePage(page);
    setSourceOpen(true);
  };

  if (!manifest) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
        Loading knowledge base…
      </div>
    );
  }

  const showArtifact = !!activeArtifact;
  const showSource = sourceOpen && sourceDoc !== null && sourcePage !== null;

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <div className="flex-1 min-w-0 flex flex-col">
        {manifest.documents.length === 0 && (
          <div className="bg-destructive/10 border-b border-destructive/30 px-4 py-2 text-xs text-red-200">
            No documents ingested. {loadError && `Error: ${loadError}. `}
            Drop PDFs into <code className="rounded bg-secondary px-1">files/</code> and run{" "}
            <code className="rounded bg-secondary px-1">npm run ingest</code>.
          </div>
        )}
        <div className="flex-1 min-h-0">
          <ChatPanel
            manifest={manifest}
            onOpenSource={openSource}
            onOpenArtifact={(a) => setActiveArtifact(a)}
            activeArtifactId={activeArtifact?.id || null}
            onOpenLibrary={() => setLibraryOpen(true)}
          />
        </div>
      </div>

      {showArtifact && (
        <div className="w-[520px] min-w-[340px] max-w-[52%] shrink-0">
          <ArtifactPanel artifact={activeArtifact} onClose={() => setActiveArtifact(null)} />
        </div>
      )}

      {showSource && (
        <div className="w-[420px] min-w-[320px] max-w-[40%] shrink-0">
          <SourceViewer
            manifest={manifest.documents}
            open={sourceOpen}
            activeDoc={sourceDoc}
            activePage={sourcePage}
            onClose={() => setSourceOpen(false)}
            onNavigate={openSource}
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
