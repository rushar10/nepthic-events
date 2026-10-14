import { importSPKI, jwtVerify, type KeyLike } from "jose";
import { SITE_KEY } from "./site";

/* ---------------------------------------------------------------------------
   Admin API authentication.

   This site has no admin logins of its own. Every admin request comes from the Nepthic Admin
   Portal, signed with the portal's private key (Ed25519). This site holds only the portal's
   PUBLIC key (PORTAL_PUBLIC_KEY), so it can check a request but could never create one.

   A token is accepted only if all of these hold:
     - signed by the portal key, algorithm EdDSA
     - issuer "nepthic-portal" and audience this site ("wholesale" / "events", or
       "<site>-preview" for the admin preview bar)
     - issued within the last 2 minutes and not expired (tokens live 60 seconds)
     - its id (jti) hasn't been seen before (replays are refused)
     - the role claims give access to this site (checked again per operation in perms.ts)

   Anything else is answered with a plain 404, so the API doesn't reveal that it exists.
--------------------------------------------------------------------------- */

export type PortalRole = "SUPER" | "SITE_ADMIN" | "STAFF" | "DOOR";
export type Claims = { sub: string; email: string; name: string; role: PortalRole; sites: string[]; jti: string; path?: string };

const ROLES: PortalRole[] = ["SUPER", "SITE_ADMIN", "STAFF", "DOOR"];
let key: Promise<KeyLike> | null = null;

/** Off unless PORTAL_PUBLIC_KEY is set (a PEM; "\n" escapes are accepted for one-line env files). */
export const opsEnabled = () => !!process.env.PORTAL_PUBLIC_KEY;

function publicKey() {
  key ??= importSPKI((process.env.PORTAL_PUBLIC_KEY ?? "").replace(/\\n/g, "\n"), "EdDSA");
  return key;
}

/* Replay guard: ids of tokens already used, kept until they could no longer verify anyway.
   Per process; tokens expire after 60 seconds, so a restart can't widen the window much. */
const seen = new Map<string, number>();
function firstUse(jti: string, exp: number) {
  const now = Date.now();
  if (seen.size > 5000) for (const [k, t] of seen) if (t < now) seen.delete(k);
  if (seen.has(jti)) return false;
  seen.set(jti, exp * 1000);
  return true;
}

export async function verifyPortalToken(token: string, audience = SITE_KEY): Promise<Claims | null> {
  if (!opsEnabled() || !token) return null;
  try {
    const { payload } = await jwtVerify(token, await publicKey(), {
      algorithms: ["EdDSA"],
      issuer: "nepthic-portal",
      audience,
      maxTokenAge: "2m",
      clockTolerance: 5,
      requiredClaims: ["sub", "jti", "exp", "iat"],
    });
    const nep = (payload as { nep?: Partial<Claims> }).nep ?? {};
    const role = ROLES.find((r) => r === nep.role);
    if (!role || typeof payload.sub !== "string" || typeof payload.jti !== "string" || !Array.isArray(nep.sites)) return null;
    if (!firstUse(payload.jti, payload.exp!)) return null;
    return {
      sub: payload.sub, jti: payload.jti, role,
      email: String(nep.email ?? ""), name: String(nep.name ?? ""),
      sites: nep.sites.map(String), path: typeof nep.path === "string" ? nep.path : undefined,
    };
  } catch {
    return null;
  }
}

/** Reads "Authorization: Bearer <token>" and verifies it. */
export async function claimsFrom(req: Request) {
  const h = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? verifyPortalToken(m[1].trim()) : null;
}
