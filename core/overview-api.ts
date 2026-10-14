import crypto from "node:crypto";
import { env } from "./env";

/* Guard for the read-only summary endpoint used by the optional Nepthic Overview dashboard.
   Off unless OVERVIEW_API_TOKEN is set. The token travels as a bearer header and is compared
   in constant time. The endpoint only reads; nothing on this site can be changed through it. */
export function overviewAuthorised(req: Request): "off" | "denied" | "ok" {
  if (!env.overviewToken) return "off";
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = crypto.createHash("sha256").update(got).digest();
  const b = crypto.createHash("sha256").update(env.overviewToken).digest();
  return crypto.timingSafeEqual(a, b) ? "ok" : "denied";
}

/** "Jordan Lee" → "Jordan L." — the overview needs activity, not customers' full names. */
export const shortName = (name: string) => {
  const [first, ...rest] = name.trim().split(/\s+/);
  return rest.length ? `${first} ${rest[rest.length - 1][0]}.` : first;
};
