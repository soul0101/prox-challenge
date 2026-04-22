import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Capability probe for the UI. Tells the settings dialog whether the server
 * already has an ANTHROPIC_API_KEY configured (either as env var or via a
 * logged-in `claude` CLI). If not, the UI will require the user to enter
 * their own key before the first request.
 */
export async function GET() {
  const hasEnvKey = Boolean(process.env.ANTHROPIC_API_KEY);
  // The Agent SDK also works without an API key when the user is logged into
  // the `claude` CLI (cookie-based auth under ~/.claude/). We can't cheaply
  // probe that from here, so we treat any non-empty `CLAUDE_CONFIG_DIR` or
  // local Vercel flag as a hint. Default: assume logged-in CLI is possible
  // locally, not in prod.
  const isVercel = Boolean(process.env.VERCEL);
  const serverHasKey = hasEnvKey || (!isVercel);

  return NextResponse.json({
    serverHasKey,
    requiresUserKey: !serverHasKey,
    isVercel,
  });
}
