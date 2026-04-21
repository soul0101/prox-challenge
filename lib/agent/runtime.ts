import { loadKB } from "@/lib/kb/load";
import { runtimeModel } from "./models";
import { runQuery } from "./sdk-query";
import { AgentEventBus, type AgentEvent } from "./events";
import { allowedToolNames, buildMcpServer } from "./tools";
import { buildSystemPrompt } from "./system";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * Drive one agent turn. Accepts the full conversation history (user + prior
 * assistant turns), returns an async iterable of AgentEvents so the caller can
 * stream them to the client as SSE.
 */
export async function* runAgent(args: {
  history: ChatTurn[];
  signal?: AbortSignal;
}): AsyncGenerator<AgentEvent> {
  const { history } = args;
  const last = history[history.length - 1];
  if (!last || last.role !== "user") {
    yield { type: "error", message: "No user message to respond to." };
    yield { type: "done" };
    return;
  }

  const { manifest } = await loadKB();
  const bus = new AgentEventBus();

  // Buffer events emitted from tools during the query so the main loop can
  // interleave them with text deltas. Using a queue + resolver pattern so we
  // don't race.
  const queue: AgentEvent[] = [];
  let wake: (() => void) | null = null;
  const wakeup = () => {
    if (wake) {
      const w = wake;
      wake = null;
      w();
    }
  };
  bus.on((e) => {
    queue.push(e);
    wakeup();
  });

  // Flatten history into a single prompt string. Agent SDK's streaming-input
  // mode is richer but overkill here — we feed prior turns as context.
  const priorContext =
    history.length > 1
      ? history
          .slice(0, -1)
          .map((h) => `[${h.role.toUpperCase()}] ${h.content}`)
          .join("\n\n")
      : "";

  const prompt = priorContext
    ? `Conversation so far:\n${priorContext}\n\n[USER just said] ${last.content}`
    : last.content;

  const mcp = buildMcpServer(bus);
  const abort = new AbortController();
  if (args.signal) {
    args.signal.addEventListener("abort", () => abort.abort(), { once: true });
  }

  let done = false;
  let threw: Error | null = null;

  const run = (async () => {
    try {
      const stream = runQuery({
        prompt,
        options: {
          model: runtimeModel(),
          systemPrompt: buildSystemPrompt(manifest),
          mcpServers: { manual: mcp },
          allowedTools: allowedToolNames(),
          // Disable all built-in tools: we have our own curated set.
          tools: [],
          permissionMode: "bypassPermissions",
          abortController: abort,
          includePartialMessages: true,
        },
      });

      for await (const m of stream as AsyncIterable<any>) {
        if (m?.type === "stream_event") {
          // Partial token streaming.
          const delta = m.event?.delta;
          if (delta?.type === "text_delta" && delta.text) {
            queue.push({ type: "delta", text: delta.text });
            wakeup();
          }
        } else if (m?.type === "assistant") {
          // Final assembled assistant message — emit the full text block as
          // "assistant" so clients that don't consume deltas still render it.
          for (const c of m.message?.content || []) {
            if (c.type === "text" && c.text) {
              queue.push({ type: "assistant", text: c.text });
            } else if (c.type === "tool_use") {
              queue.push({
                type: "tool_start",
                name: String(c.name || ""),
                input: (c.input as Record<string, unknown>) || {},
                id: String(c.id || ""),
              });
            }
          }
          wakeup();
        } else if (m?.type === "user") {
          // Tool result messages arrive as "user" role. Announce tool
          // completion with a short summary so the UI can close the chip.
          for (const c of m.message?.content || []) {
            if (c.type === "tool_result") {
              let summary = "";
              const content = (c as any).content;
              if (typeof content === "string") summary = content;
              else if (Array.isArray(content)) {
                const t = content.find((x: any) => x.type === "text");
                if (t) summary = t.text || "";
              }
              queue.push({
                type: "tool_end",
                name: "",
                id: String((c as any).tool_use_id || ""),
                summary: String(summary).slice(0, 160),
              });
            }
          }
          wakeup();
        } else if (m?.type === "result") {
          if (m.subtype && m.subtype !== "success") {
            queue.push({
              type: "error",
              message: `agent ended abnormally: ${m.subtype}`,
            });
          }
        }
      }
    } catch (err) {
      threw = err as Error;
    } finally {
      done = true;
      wakeup();
    }
  })();

  // Consumer: drain the queue, yielding as they arrive.
  while (true) {
    while (queue.length) {
      const e = queue.shift()!;
      yield e;
    }
    if (done) break;
    await new Promise<void>((res) => {
      wake = res;
    });
  }

  await run;
  const thrownErr = threw as Error | null;
  if (thrownErr) {
    yield { type: "error", message: thrownErr.message };
  }
  yield { type: "done" };
}
