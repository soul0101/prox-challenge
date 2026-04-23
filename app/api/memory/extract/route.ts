import type { NextRequest } from "next/server";
import { HAIKU_MODEL } from "@/lib/agent/models";
import { collectText, envWithApiKey, runQuery } from "@/lib/agent/sdk-query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

/**
 * Distill up to N stable facts about the USER (not the product) from one
 * exchange, merging with the facts we already have. Uses the same Claude
 * Agent SDK path as /api/chat so it inherits whatever auth the app is using
 * (user-supplied key OR the logged-in `claude` CLI). Going through the
 * plain Anthropic SDK would require a raw API key even when the CLI is
 * authenticated, which silently broke extraction in local dev.
 *
 * The client fires this fire-and-forget after each chat turn and merges the
 * returned `facts` into localStorage. Never blocks the user's next turn.
 */

const MAX_FACTS = 12;

const SYSTEM = `You maintain a DURABLE personalization memory for one user of a product-manual chat assistant.

The memory must stay small and high-quality. Most exchanges add nothing — that is normal and expected. Your default action is to return the existing list unchanged.

QUALITY BAR — include a fact ONLY if it passes ALL of these:
1. It is about the USER, not the product.
2. It is STABLE — still likely to be true weeks from now, not transient context from this one question.
3. It is SPECIFIC — "Owns a 2024 Miller Multimatic 215" passes; "has a welder" does not.
4. It would DEMONSTRABLY change how a future answer is written. If you can't name a future question it would affect, it is noise — drop it.
5. It was stated explicitly by the user or clearly implied by their own words — not inferred from the assistant's reply.

CAPTURE-WORTHY (examples only)
- Product / model / configuration the user owns.
- Skill level or role (first-timer, professional, licensed).
- Hard constraints on their setup (120V only, unheated garage, no helmet yet).
- Explicit preferences for HOW to answer (metric, step-by-step with photos, terse tables).

DO NOT CAPTURE
- Anything about the product itself — that lives in the manual.
- One-off questions, current mood, "user asked about X today".
- Anything inferred from the assistant's answer rather than the user's words.
- Safety-sensitive details (medical, address, phone) — drop silently.
- Vague or generic statements ("wants helpful info", "is curious"). If it doesn't pinpoint how to answer differently, it is noise.

BOUNDED GROWTH — critical
- HARD CAP: ${MAX_FACTS} facts total. A healthy memory is 3–8 facts. Prefer fewer.
- Before adding, check if an existing fact already covers the information. If so, UPDATE that fact in place (refine wording, merge details) — NEVER add a second overlapping one.
- If you are at or near ${MAX_FACTS} and have a new fact genuinely worth keeping, DROP the weakest existing fact to make room. Never exceed ${MAX_FACTS}.
- Merge variants aggressively: "Uses 120V outlet" and "Only has 120V power" should be one fact, not two.
- If the existing list already captures what's relevant, return it UNCHANGED. Silence is the correct default.

OUTPUT FORMAT
Return ONLY a JSON object. No prose, no markdown fences, no commentary:
{"facts": ["fact one", "fact two", ...]}`;

interface Body {
  apiKey?: string;
  existing?: unknown;
  user?: unknown;
  assistant?: unknown;
}

function extractJson(raw: string): { facts: string[] } | null {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : trimmed;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(body.slice(start, end + 1));
    if (!parsed || !Array.isArray(parsed.facts)) return null;
    const facts = (parsed.facts as unknown[])
      .filter((f): f is string => typeof f === "string")
      .map((f) => f.trim())
      .filter((f) => f.length > 0 && f.length <= 200)
      .slice(0, MAX_FACTS);
    return { facts };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ facts: null, error: "bad json" }, { status: 400 });
  }

  const existing = Array.isArray(body.existing)
    ? body.existing
        .filter((f): f is string => typeof f === "string")
        .slice(0, MAX_FACTS)
    : [];
  const userMsg = typeof body.user === "string" ? body.user.slice(0, 4000) : "";
  const assistantMsg =
    typeof body.assistant === "string" ? body.assistant.slice(0, 4000) : "";
  const apiKey =
    typeof body.apiKey === "string" && body.apiKey ? body.apiKey : undefined;

  if (!userMsg) {
    return Response.json({ facts: existing });
  }

  const prompt = `EXISTING MEMORY (may be empty):
${existing.length ? existing.map((f) => `- ${f}`).join("\n") : "(none)"}

RECENT EXCHANGE
[USER]
${userMsg}

[ASSISTANT]
${assistantMsg}

Return the updated JSON object now.`;

  const abort = new AbortController();
  const onClose = () => abort.abort();
  req.signal.addEventListener("abort", onClose, { once: true });

  try {
    const stream = runQuery({
      prompt,
      options: {
        model: HAIKU_MODEL,
        systemPrompt: SYSTEM,
        // No tools — pure text in, JSON out.
        mcpServers: {},
        allowedTools: [],
        tools: [],
        permissionMode: "bypassPermissions",
        abortController: abort,
        env: envWithApiKey(apiKey),
      },
    });

    const { text, error: streamError } = await collectText(stream);
    if (streamError) {
      return Response.json({ facts: existing, error: streamError });
    }
    const parsed = extractJson(text);
    if (!parsed) {
      return Response.json({
        facts: existing,
        error: "parse failed",
        raw: text.slice(0, 400),
      });
    }
    return Response.json({ facts: parsed.facts });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    console.error("[memory/extract]", msg);
    return Response.json({ facts: existing, error: msg }, { status: 200 });
  }
}
