import crypto from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { db, eq, sessions, users, type Role } from "@/db";

/* Sessions live in this site's own Postgres; the cookie holds a random token and the
   database stores only its SHA-256 hash. The cookie is host-only and named for this
   site, so an Events login never works on, or collides with, any other Nepthic site. */

const COOKIE = "nepthic_events_session";
const SESSION_DAYS = 30;

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export const hashPassword = (pw: string) => bcrypt.hash(pw, 12);

export async function createSession(userId: string) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5);
  await db.insert(sessions).values({ id: sha256(token), userId, expiresAt });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.id, sha256(token)));
  jar.set(COOKIE, "", { path: "/", expires: new Date(0) });
}

export const getUser = cache(async () => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const s = await db.query.sessions.findFirst({
    where: eq(sessions.id, sha256(token)),
    with: { user: { columns: { passwordHash: false } } },
  });
  if (!s || s.expiresAt < new Date()) return null;
  return s.user;
});

export type SessionUser = NonNullable<Awaited<ReturnType<typeof getUser>>>;

export async function requireUser(roles?: Role[], loginPath = "/login") {
  const user = await getUser();
  if (!user) redirect(loginPath);
  if (roles && !roles.includes(user.role)) redirect(`${loginPath}?denied=1`);
  return user;
}

let dummyHash: string | undefined;

export async function loginWithPassword(email: string, password: string) {
  const user = await db.query.users.findFirst({ where: eq(users.email, email.trim().toLowerCase()) });
  // Compare against a dummy hash when the account is missing so timing doesn't reveal it.
  dummyHash ??= await bcrypt.hash("not-a-real-password", 12);
  const ok = await bcrypt.compare(password, user?.passwordHash ?? dummyHash);
  if (!user || !ok) return null;
  await createSession(user.id);
  return user;
}

/* Every account on this site is a customer. Nepthic staff (including door staff) use the
   separate Admin Portal, which has its own accounts; there is no staff login here. */
