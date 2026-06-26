import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * One-click unsubscribe tokens (§9). A token is a stable, unguessable handle for
 * (orgId, email) so the public /u/[token] route can honor an opt-out without a
 * login and without exposing the raw email in the URL. HMAC-signed with a key
 * derived from ENCRYPTION_KEY; no DB lookup needed to validate.
 *
 * Format: base64url(payloadJson).base64url(hmac)
 */

function key(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error("ENCRYPTION_KEY is not set");
  // Derive a distinct subkey so this never collides with token encryption use.
  return createHmac("sha256", Buffer.from(raw, "base64")).update("unsubscribe-v1").digest();
}

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

export function makeUnsubscribeToken(orgId: string, email: string): string {
  const payload = b64url(Buffer.from(JSON.stringify({ o: orgId, e: email.toLowerCase() })));
  const sig = b64url(createHmac("sha256", key()).update(payload).digest());
  return `${payload}.${sig}`;
}

export function verifyUnsubscribeToken(token: string): { orgId: string; email: string } | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = b64url(createHmac("sha256", key()).update(payload).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const { o, e } = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof o !== "string" || typeof e !== "string") return null;
    return { orgId: o, email: e };
  } catch {
    return null;
  }
}

export function unsubscribeUrl(orgId: string, email: string): string {
  const base = process.env.NEXTAUTH_URL || "http://localhost:3000";
  return `${base}/u/${makeUnsubscribeToken(orgId, email)}`;
}
