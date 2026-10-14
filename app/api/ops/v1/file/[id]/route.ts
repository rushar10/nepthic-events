import { db, eq, uploads } from "@/db";
import { claimsFrom } from "@/core/ops/token";
import { accessFor, allowed } from "@/core/ops/perms";

export const dynamic = "force-dynamic";

/** Private uploads (return photos) for the portal. Same token rules as the rest of the admin API. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const claims = await claimsFrom(req);
  if (!claims || !allowed(accessFor(claims), "view")) return new Response("Not found", { status: 404 });
  const u = await db.query.uploads.findFirst({ where: eq(uploads.id, (await params).id) });
  if (!u) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(u.data), { headers: { "content-type": u.mime, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
}
