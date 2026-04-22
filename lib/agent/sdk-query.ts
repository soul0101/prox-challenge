import type { Options } from "@anthropic-ai/claude-agent-sdk";
import { query as sdkQuery } from "@anthropic-ai/claude-agent-sdk";

/**
 * Thin adapter around the Claude Agent SDK's `query()` that:
 *  - throws a helpful error if the `claude` CLI is not on PATH
 *  - proxies through all options
 *
 * The Claude Agent SDK spawns a `claude` subprocess and streams messages back.
 * We use this for both the ingest-time vision passes and the runtime chat loop
 * so the whole app authenticates via the user's existing Claude login.
 */
export function runQuery(args: { prompt: string; options: Options }) {
  // Capture the subprocess's stderr. The SDK's default is `"ignore"` which
  // means when the `claude` CLI crashes the only surface is
  // `Claude Code process exited with code 1` — not diagnosable in prod.
  // Forwarding to console.error lands the real error in Vercel's runtime
  // logs (`vercel logs <url> --expand`).
  const withStderr: Options = {
    ...args.options,
    stderr: (msg: string) => {
      if (args.options.stderr) args.options.stderr(msg);
      console.error("[claude-cli stderr]", msg);
    },
  };
  return sdkQuery({ prompt: args.prompt, options: withStderr });
}

/**
 * Build an `env` block for SDK Options that injects a user-supplied API key.
 * The SDK passes this env to the `claude` subprocess; `undefined` falls back
 * to `process.env`. We merge with process.env so PATH/NODE/etc. still reach
 * the subprocess.
 */
export function envWithApiKey(apiKey?: string): Options["env"] | undefined {
  // The claude CLI writes to $HOME/.claude/… for session state, logs, and
  // other scratch files. On Vercel serverless, $HOME points to a read-only
  // path; only /tmp is writable. Redirect HOME (and XDG_* fallbacks) to
  // /tmp so the subprocess can initialise cleanly. Safe locally too — the
  // SDK's CLI doesn't reach into HOME for real config when
  // ANTHROPIC_API_KEY is provided.
  const overrides: Record<string, string> = {};
  if (process.env.VERCEL) {
    overrides.HOME = "/tmp";
    overrides.XDG_CONFIG_HOME = "/tmp";
    overrides.XDG_CACHE_HOME = "/tmp";
    overrides.XDG_DATA_HOME = "/tmp";
  }
  if (apiKey) overrides.ANTHROPIC_API_KEY = apiKey;

  if (Object.keys(overrides).length === 0) return undefined;
  return { ...process.env, ...overrides };
}

/**
 * Collect the final textual assistant response from a query() stream.
 * Useful for one-shot callers (ingest, the map builder, region-locator).
 */
export async function collectText(stream: AsyncIterable<unknown>): Promise<{
  text: string;
  turns: number;
  error?: string;
}> {
  let text = "";
  let turns = 0;
  let error: string | undefined;
  for await (const m of stream as AsyncIterable<any>) {
    if (m?.type === "assistant" && m.message?.content) {
      for (const c of m.message.content) {
        if (c.type === "text") text = c.text; // keep the LAST text block
      }
    } else if (m?.type === "result") {
      turns = m.num_turns ?? turns;
      if (m.subtype && m.subtype !== "success") {
        error = m.subtype;
      }
    }
  }
  return { text, turns, error };
}

export function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  // Strip fenced blocks.
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1] : trimmed;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) {
    const arrStart = body.indexOf("[");
    const arrEnd = body.lastIndexOf("]");
    if (arrStart >= 0 && arrEnd > arrStart) return JSON.parse(body.slice(arrStart, arrEnd + 1));
    throw new Error("no JSON object found in response");
  }
  return JSON.parse(body.slice(start, end + 1));
}
