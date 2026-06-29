import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Lightweight route guard. We only check for the presence of a session cookie
 * here (Edge-safe, no DB/crypto); the authoritative check is requireOrg() in
 * each protected server component. This keeps unauthenticated users out of the
 * app shell without pulling the full auth stack into the Edge runtime.
 */
const PROTECTED_PREFIXES = ["/welcome", "/leads", "/conversations", "/agent", "/connections", "/deliverability", "/clients", "/account", "/billing"];
const APP_HOME = "/"; // Command Center

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isProtected =
    pathname === APP_HOME || PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!isProtected) return NextResponse.next();

  const hasSession =
    req.cookies.has("authjs.session-token") || req.cookies.has("__Secure-authjs.session-token");

  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/sign-in";
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Run on everything except Next internals, the auth API, and static assets.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|sign-in|sign-up).*)"],
};
