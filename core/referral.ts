import { cookies } from "next/headers";
import { and, db, eq, partners } from "@/db";

/* Partner referral links: events.nepthic.com/?ref=<code> (any page). The middleware keeps the
   code in a first-party cookie for 30 days; checkout tags the order and its tickets with that
   partner. A partner code typed at checkout does the same. Suspended partners tag nothing. */
export const REF_COOKIE = "nep_ref";
export const REF_PATTERN = /^[a-z0-9-]{3,40}$/;

export const POST_FEE_CENTS = 800;
export const POST_CUTOFF_DAYS = 7;

export async function activePartnerFor(code: string | null | undefined) {
  const c = (code ?? "").trim().toLowerCase();
  if (!REF_PATTERN.test(c)) return null;
  return (await db.query.partners.findFirst({ where: and(eq(partners.referralCode, c), eq(partners.status, "ACTIVE")) })) ?? null;
}

export async function referralPartner() {
  return activePartnerFor((await cookies()).get(REF_COOKIE)?.value);
}
