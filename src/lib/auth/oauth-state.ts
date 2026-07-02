import { randomBytes, timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

/**
 * OAuth `state` CSRF protection. The connect flow embeds a random nonce in the
 * `state` param AND sets it in an httpOnly cookie; the callback requires the two
 * to match (constant-time). An attacker can't forge a callback for a victim
 * because they can't set the victim's cookie — this blocks classic OAuth
 * login-CSRF, on top of the existing state.orgId === session check.
 */
const COOKIE = "ws_oauth_state";

export function buildOAuthState(payload: Record<string, unknown>): { state: string; nonce: string } {
  const nonce = randomBytes(18).toString("base64url");
  const state = Buffer.from(JSON.stringify({ ...payload, n: nonce })).toString("base64url");
  return { state, nonce };
}

export function setOAuthStateCookie(res: NextResponse, nonce: string): void {
  res.cookies.set(COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", // must survive the top-level redirect back from the provider
    path: "/",
    maxAge: 600, // 10 min to complete the flow
  });
}

export function clearOAuthStateCookie(res: NextResponse): void {
  res.cookies.set(COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

/**
 * Parse `state` and require its nonce to match the cookie. Returns the decoded
 * payload on success, or null if the state is malformed or the nonce doesn't
 * match (missing cookie, tampered/forged state).
 */
export function readVerifiedOAuthState(req: NextRequest, stateRaw: string): Record<string, unknown> | null {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(Buffer.from(stateRaw, "base64url").toString());
  } catch {
    return null;
  }
  const cookieNonce = req.cookies.get(COOKIE)?.value ?? "";
  const stateNonce = typeof parsed.n === "string" ? parsed.n : "";
  if (!cookieNonce || !stateNonce) return null;
  const a = Buffer.from(cookieNonce);
  const b = Buffer.from(stateNonce);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return parsed;
}
