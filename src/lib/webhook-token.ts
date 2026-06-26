import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Per-org webhook tokens. A provider webhook (e.g. Cal.com) is unauthenticated,
 * so the receiving URL must itself identify the org — otherwise a bare email
 * match leaks across tenants. The org embeds a signed token in its webhook URL;
 * the route verifies it and scopes all lookups to that org. HMAC-derived from
 * ENCRYPTION_KEY (distinct subkey), so no DB round-trip is needed to validate.
 */
function key(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error("ENCRYPTION_KEY is not set");
  return createHmac("sha256", Buffer.from(raw, "base64")).update("webhook-token-v1").digest();
}

export function makeWebhookToken(orgId: string): string {
  const sig = createHmac("sha256", key()).update(orgId).digest("base64url");
  return `${Buffer.from(orgId).toString("base64url")}.${sig}`;
}

export function verifyWebhookToken(token: string | null | undefined): string | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  let orgId: string;
  try {
    orgId = Buffer.from(payload, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const expected = createHmac("sha256", key()).update(orgId).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return orgId;
}

export function calcomWebhookUrl(orgId: string): string {
  const base = process.env.NEXTAUTH_URL || "http://localhost:3000";
  return `${base}/api/webhooks/calcom?t=${makeWebhookToken(orgId)}`;
}
