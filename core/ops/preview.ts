import crypto from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { adminPreviews, db, eq, lt } from "@/db";
import { verifyPortalToken } from "./token";
import { SITE_KEY } from "./site";
import { audit } from "@/core/audit";

/* ---------------------------------------------------------------------------
   Admin preview: "View live site" in the portal opens this site with a bar on top that only
   that admin sees.

   1. The portal posts a one-time token (signed by the portal, audience "<site>-preview",
      60 seconds) to POST /api/ops/v1/preview. It is never put in a URL.
   2. This site checks it, stores a 30-minute preview session (only a hash of the cookie
      value) and sets an httpOnly cookie, then redirects to the page asked for.
   3. Pages render the preview bar on the server only while that cookie maps to a live
      session. The bar is a server component: customers never receive its code or data.
--------------------------------------------------------------------------- */

export const PREVIEW_COOKIE = "nep_preview";
const MINUTES = 30;
const sha = (v: string) => crypto.createHash("sha256").update(v).digest("hex");

/** Only same-site paths, so the redirect can't be pointed somewhere else. */
export const safePath = (p: unknown) => (typeof p === "string" && p.startsWith("/") && !p.startsWith("//") && !p.includes("\\") ? p : "/");

export async function startPreview(token: string) {
  const c = await verifyPortalToken(token, `${SITE_KEY}-preview`);
  if (!c) return null;
  const raw = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + MINUTES * 60e3);
  await db.delete(adminPreviews).where(lt(adminPreviews.expiresAt, new Date()));
  await db.insert(adminPreviews).values({ id: sha(raw), adminId: c.sub, email: c.email, name: c.name, role: c.role, expiresAt });
  (await cookies()).set(PREVIEW_COOKIE, raw, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires: expiresAt,
  });
  await audit(`portal:${c.sub}`, "preview.started", "Preview", c.jti, { by: c.email, role: c.role });
  return { path: safePath(c.path) };
}

export async function endPreview() {
  const jar = await cookies();
  const raw = jar.get(PREVIEW_COOKIE)?.value;
  if (raw) await db.delete(adminPreviews).where(eq(adminPreviews.id, sha(raw)));
  jar.set(PREVIEW_COOKIE, "", { path: "/", expires: new Date(0) });
}

/** The current admin preview, or null for everyone else (all customers). */
export const getPreview = cache(async () => {
  const raw = (await cookies()).get(PREVIEW_COOKIE)?.value;
  if (!raw) return null;
  const p = await db.query.adminPreviews.findFirst({ where: eq(adminPreviews.id, sha(raw)) });
  if (!p || p.expiresAt < new Date()) return null;
  return { name: p.name, email: p.email, role: p.role, expiresAt: p.expiresAt };
});
