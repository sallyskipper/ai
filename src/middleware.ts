import { NextResponse, type NextRequest } from "next/server";

// Fast redirect for signed-out visitors. Real authorization happens on the
// server in every page, action and route handler.
export function middleware(req: NextRequest) {
  if (!req.cookies.get("rl_session")) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/dashboard/:path*", "/admin/:path*", "/checkout/:path*"] };
