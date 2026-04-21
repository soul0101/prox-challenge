/**
 * Server-sent event types that flow from /api/chat to the browser.
 * Tool handlers emit these via the AgentEventBus (a per-request sink); the SSE
 * route forwards them to the client.
 */

export type AgentEvent =
  | { type: "status"; message: string }
  | { type: "tool_start"; name: string; input: Record<string, unknown>; id: string }
  | { type: "tool_end"; name: string; id: string; summary: string }
  | { type: "delta"; text: string }
  | { type: "assistant"; text: string }
  | {
      type: "source";
      doc: string;
      doc_title: string;
      page: number;
      url: string;
      caption?: string;
      bbox?: [number, number, number, number];
      cropUrl?: string;
    }
  | {
      type: "artifact";
      id: string;
      kind: "react" | "html" | "svg" | "mermaid" | "markdown";
      title: string;
      code: string;
    }
  | {
      type: "ask";
      question: string;
      options: { id: string; label: string; detail?: string }[];
      allow_free_text: boolean;
    }
  | { type: "error"; message: string }
  | { type: "done" };

export class AgentEventBus {
  private listeners: ((e: AgentEvent) => void)[] = [];

  emit(e: AgentEvent): void {
    for (const l of this.listeners) l(e);
  }

  on(l: (e: AgentEvent) => void): () => void {
    this.listeners.push(l);
    return () => {
      this.listeners = this.listeners.filter((x) => x !== l);
    };
  }
}
