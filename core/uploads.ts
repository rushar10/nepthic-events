import sharp from "sharp";
import { db, eq, uploads } from "@/db";
import { getUser, STAFF_ROLES } from "./auth";

/* Images are stored in Postgres so every app can serve them without shared disk.
   For high volume, swap this module for S3/R2 and keep the same function names. */

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

export async function saveImages(files: File[], userId: string | null, opts: { max?: number; isPublic?: boolean } = {}) {
  const real = files.filter((f) => f && typeof f === "object" && f.size > 0).slice(0, opts.max ?? 6);
  for (const f of real) {
    if (!ALLOWED.includes(f.type)) throw new Error(`${f.name} isn't a JPEG, PNG, WebP or HEIC image.`);
    if (f.size > MAX_BYTES) throw new Error(`${f.name} is larger than 5 MB.`);
  }
  const ids: string[] = [];
  for (const f of real) {
    // Re-encode as WebP, max 1600px, EXIF rotation applied and metadata stripped.
    let data: Buffer = Buffer.from(await f.arrayBuffer());
    let mime = f.type;
    try {
      data = await sharp(data).rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
      mime = "image/webp";
    } catch { /* keep the original if it can't be decoded (e.g. some HEIC files) */ }
    const [u] = await db.insert(uploads).values({ userId, mime, size: data.length, data, isPublic: !!opts.isPublic }).returning({ id: uploads.id });
    ids.push(u.id);
  }
  return ids;
}

/** Body of GET /api/uploads/[id]. Public uploads (event imagery) are open; others need the owner or staff. */
export async function serveUpload(id: string) {
  const u = await db.query.uploads.findFirst({ where: eq(uploads.id, id) });
  if (!u) return new Response("Not found", { status: 404 });
  if (!u.isPublic) {
    const user = await getUser();
    const allowed = user && (STAFF_ROLES.includes(user.role) || user.id === u.userId);
    if (!allowed) return new Response("Not found", { status: 404 });
  }
  return new Response(new Uint8Array(u.data), {
    headers: {
      "content-type": u.mime,
      "cache-control": u.isPublic ? "public, max-age=31536000, immutable" : "private, max-age=3600",
      "x-content-type-options": "nosniff",
    },
  });
}

export const uploadUrl = (base: string, id: string) => `${base}/api/uploads/${id}`;
