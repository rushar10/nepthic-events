import { endPreview, safePath } from "@/core/ops/preview";

export const dynamic = "force-dynamic";

/** "Exit preview": forgets the preview session and returns to the same page as a customer would see it. */
export async function POST(req: Request) {
  await endPreview();
  const fd = await req.formData().catch(() => null);
  return new Response(null, { status: 303, headers: { location: safePath(fd?.get("to")), "cache-control": "no-store" } });
}
