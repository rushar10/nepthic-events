import { startPreview } from "@/core/ops/preview";

export const dynamic = "force-dynamic";

/** Starts an admin preview from a one-time portal token (posted, never in the URL). */
export async function POST(req: Request) {
  const fd = await req.formData().catch(() => null);
  const started = fd ? await startPreview(String(fd.get("token") ?? "")) : null;
  if (!started) return new Response("Not found", { status: 404 });
  return new Response(null, { status: 303, headers: { location: started.path, "cache-control": "no-store" } });
}
