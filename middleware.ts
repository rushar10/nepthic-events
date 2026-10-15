import { NextResponse, type NextRequest } from "next/server";

/* 1. Partner referral links (?ref=<code>): remembered in a first-party cookie for 30 days so the
      order is tagged with that partner at checkout (core/referral.ts).
   2. Passes the page path to server components, so the admin preview bar can offer "Edit this
      event". Only when an admin preview cookie is present; everyone else is untouched. */
export function middleware(req: NextRequest) {
  const ref = req.nextUrl.searchParams.get("ref")?.toLowerCase() ?? "";
  let res: NextResponse;
  if (req.cookies.has("nep_preview")) {
    const h = new Headers(req.headers);
    h.set("x-nep-path", req.nextUrl.pathname + req.nextUrl.search);
    res = NextResponse.next({ request: { headers: h } });
  } else res = NextResponse.next();
  if (/^[a-z0-9-]{3,40}$/.test(ref)) {
    res.cookies.set("nep_ref", ref, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 30 * 86400 });
  }
  return res;
}

export const config = { matcher: ["/((?!api|_next|.*\\..*).*)"] };
