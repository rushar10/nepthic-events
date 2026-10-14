import { NextResponse, type NextRequest } from "next/server";

/* Passes the page path to server components, so the admin preview bar can offer "Edit this
   product". Only when an admin preview cookie is present; everyone else is untouched. */
export function middleware(req: NextRequest) {
  if (!req.cookies.has("nep_preview")) return NextResponse.next();
  const h = new Headers(req.headers);
  h.set("x-nep-path", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.next({ request: { headers: h } });
}

export const config = { matcher: ["/((?!api|_next|.*\\..*).*)"] };
