import { loadKB } from "@/lib/kb/load";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { manifest } = await loadKB();
    return Response.json(manifest);
  } catch (err) {
    return Response.json(
      {
        version: 1,
        generated_at: null,
        documents: [],
        error: (err as Error).message,
      },
      { status: 200 },
    );
  }
}
