import { loadKB } from "@/lib/kb/load";
import { modelFor, modelForTier } from "./models";
import { envWithApiKey, runQuery } from "./sdk-query";
import { AgentEventBus, type AgentEvent } from "./events";
import { allowedToolNames, buildMcpServer } from "./tools";
import { buildSystemPrompt } from "./system";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface AgentSettings {
  /** Optional user-supplied API key; overrides server env for this call. */
  apiKey?: string;
  /** Override the orchestrator model tier for this call. */
  modelTier?: string;
  /** Override the artifact-author model tier for this call. */
  artifactModelTier?: string;
  /** Stable facts the client wants baked into the system prompt. */
  memory?: string[];
}

/**
 * Upper bound on verbatim prior turns. Older turns get elided into a short
 * marker line so the prompt length stays predictable regardless of how long
 * the conversation gets. The persistent user-memory block is a separate
 * signal and handles long-range recall.
 */
const WINDOW_TURNS = 16;

function buildPriorContext(history: ChatTurn[]): string {
  if (history.length <= 1) return "";
  const prior = history.slice(0, -1);
  const window = prior.slice(-WINDOW_TURNS);
  const dropped = prior.length - window.length;
  const lines = window.map(
    (h) => `[${h.role.toUpperCase()}] ${h.content}`,
  );
  if (dropped > 0) {
    lines.unshift(`[… ${dropped} earlier message${dropped === 1 ? "" : "s"} elided …]`);
  }
  return lines.join("\n\n");
}

/**
 * Drive one agent turn. Accepts the full conversation history (user + prior
 * assistant turns), returns an async iterable of AgentEvents so the caller can
 * stream them to the client as SSE.
 */
export async function* runAgent(args: {
  history: ChatTurn[];
  signal?: AbortSignal;
  settings?: AgentSettings;
}): AsyncGenerator<AgentEvent> {
  const { history, settings } = args;
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

  // Flatten history into a single prompt string with a sliding window so very
  // long conversations can't blow the context budget. Long-range recall is
  // provided separately via the user-memory block in the system prompt.
  const priorContext = buildPriorContext(history);
  const prompt = priorContext
    ? `Conversation so far:\n${priorContext}\n\n[USER just said] ${last.content}`
    : last.content;

  const mcp = buildMcpServer(bus, {
    apiKey: settings?.apiKey,
    artifactModelTier: settings?.artifactModelTier,
  });
  const abort = new AbortController();
  if (args.signal) {
    args.signal.addEventListener("abort", () => abort.abort(), { once: true });
  }

  let done = false;
  let threw: Error | null = null;

  /** Tool-use ids we've already emitted an early `tool_start` for, so the
   *  final assembled message doesn't double-fire a second chip. */
  const earlyToolStarts = new Set<string>();
  /** Partial JSON buffer per content-block index, so we can extract
   *  "title"/"kind" early and surface them to the UI while the agent is
   *  still streaming the tool arguments. */
  const toolInputBuffers = new Map<
    number,
    { id: string; name: string; buf: string }
  >();
  /** Remember the last partial input we surfaced per tool_id, so we only
   *  fire `tool_update` when something actually changed. */
  const lastPartial = new Map<string, string>();

  function extractPartialInput(partial: string): Record<string, string> | null {
    const out: Record<string, string> = {};
    const t = partial.match(/"title"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (t) {
      try { out.title = JSON.parse(`"${t[1]}"`); } catch { /* ignore */ }
    }
    const k = partial.match(/"kind"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (k) {
      try { out.kind = JSON.parse(`"${k[1]}"`); } catch { /* ignore */ }
    }
    const q = partial.match(/"query"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (q) {
      try { out.query = JSON.parse(`"${q[1]}"`); } catch { /* ignore */ }
    }
    const d = partial.match(/"description"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (d) {
      try { out.description = JSON.parse(`"${d[1]}"`); } catch { /* ignore */ }
    }
    const p = partial.match(/"page"\s*:\s*(\d+)/);
    if (p) out.page = p[1];
    return Object.keys(out).length ? out : null;
  }

  const run = (async () => {
    try {
      const overrideModel = modelForTier(settings?.modelTier);
      const stream = runQuery({
        prompt,
        options: {
          model: overrideModel || modelFor("qa.orchestrator"),
          systemPrompt: buildSystemPrompt(manifest, { memory: settings?.memory }),
          mcpServers: { manual: mcp },
          allowedTools: allowedToolNames(),
          // Disable all built-in tools: we have our own curated set.
          tools: [],
          permissionMode: "bypassPermissions",
          abortController: abort,
          includePartialMessages: true,
          env: envWithApiKey(settings?.apiKey),
        },
      });

      for await (const m of stream as AsyncIterable<any>) {
        if (m?.type === "stream_event") {
          const ev = m.event;
          if (ev?.type === "content_block_start") {
            const block = ev.content_block;
            if (block?.type === "tool_use" && block.id) {
              // Fire an early tool_start so the UI shows a chip immediately,
              // before Claude finishes streaming the tool arguments.
              earlyToolStarts.add(block.id);
              toolInputBuffers.set(ev.index, {
                id: String(block.id),
                name: String(block.name || ""),
                buf: "",
              });
              queue.push({
                type: "tool_start",
                name: String(block.name || ""),
                input: {},
                id: String(block.id),
              });
              wakeup();
            }
          } else if (ev?.type === "content_block_delta") {
            const delta = ev.delta;
            if (delta?.type === "text_delta" && delta.text) {
              queue.push({ type: "delta", text: delta.text });
              wakeup();
            } else if (
              delta?.type === "input_json_delta" &&
              typeof delta.partial_json === "string"
            ) {
              const buf = toolInputBuffers.get(ev.index);
              if (buf) {
                buf.buf += delta.partial_json;
                const partial = extractPartialInput(buf.buf);
                if (partial) {
                  const serialized = JSON.stringify(partial);
                  if (lastPartial.get(buf.id) !== serialized) {
                    lastPartial.set(buf.id, serialized);
                    queue.push({
                      type: "tool_update",
                      id: buf.id,
                      input: partial,
                    });
                    wakeup();
                  }
                }
              }
            }
          } else if (ev?.type === "content_block_stop") {
            toolInputBuffers.delete(ev.index);
          }
        } else if (m?.type === "assistant") {
          // Final assembled assistant message. Emit text blocks fully; for
          // tool_use blocks we already fired an early tool_start, so send a
          // tool_update with the complete, parsed input instead of a second
          // tool_start chip.
          for (const c of m.message?.content || []) {
            if (c.type === "text" && c.text) {
              queue.push({ type: "assistant", text: c.text });
            } else if (c.type === "tool_use") {
              if (earlyToolStarts.has(String(c.id))) {
                queue.push({
                  type: "tool_update",
                  id: String(c.id),
                  input: (c.input as Record<string, unknown>) || {},
                });
              } else {
                queue.push({
                  type: "tool_start",
                  name: String(c.name || ""),
                  input: (c.input as Record<string, unknown>) || {},
                  id: String(c.id || ""),
                });
              }
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
