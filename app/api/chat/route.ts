import type { NextRequest } from "next/server";
import { runAgent, type AgentSettings, type ChatTurn } from "@/lib/agent/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function sseLine(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

const VALID_TIERS = ["haiku", "sonnet", "opus"] as const;

function pickTier(v: unknown): (typeof VALID_TIERS)[number] | undefined {
  return typeof v === "string" && (VALID_TIERS as readonly string[]).includes(v)
    ? (v as (typeof VALID_TIERS)[number])
    : undefined;
}

export async function POST(req: NextRequest) {
  let body: {
    history?: ChatTurn[];
    apiKey?: string;
    model?: string;
    artifactModel?: string;
    memory?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return new Response("bad json", { status: 400 });
  }
  const history = Array.isArray(body.history) ? body.history : [];
  if (history.length === 0) return new Response("empty history", { status: 400 });

  const memory = Array.isArray(body.memory)
    ? body.memory
        .filter((f): f is string => typeof f === "string")
        .map((f) => f.trim())
        .filter((f) => f.length > 0)
        .slice(0, 40)
    : undefined;

  const settings: AgentSettings = {
    apiKey: typeof body.apiKey === "string" && body.apiKey ? body.apiKey : undefined,
    modelTier: pickTier(body.model),
    artifactModelTier: pickTier(body.artifactModel),
    memory,
  };

  const abort = new AbortController();
  const onClose = () => abort.abort();
  req.signal.addEventListener("abort", onClose, { once: true });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(sseLine("status", { message: "thinking" })));
      try {
        for await (const e of runAgent({ history, signal: abort.signal, settings })) {
          controller.enqueue(encoder.encode(sseLine(e.type, e)));
          if (e.type === "done") break;
        }
      } catch (err) {
        controller.enqueue(
          encoder.encode(sseLine("error", { message: (err as Error).message })),
        );
      } finally {
        controller.enqueue(encoder.encode(sseLine("done", { type: "done" })));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
