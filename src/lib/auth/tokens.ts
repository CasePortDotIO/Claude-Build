import { randomBytes, createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

/**
 * Single-use, expiring tokens for account email flows. The raw token is returned
 * once (to embed in an emailed link) and never stored — only its SHA-256 hash is
 * persisted, so a database read can't be replayed to take over an account.
 */
export type AuthTokenType = "PASSWORD_RESET" | "EMAIL_VERIFY";

const TTL_MS: Record<AuthTokenType, number> = {
  PASSWORD_RESET: 60 * 60 * 1000, // 1 hour
  EMAIL_VERIFY: 24 * 60 * 60 * 1000, // 24 hours
};

function hash(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Create a token, invalidating any prior unused tokens of the same type. */
export async function createAuthToken(userId: string, type: AuthTokenType): Promise<string> {
  const raw = randomBytes(32).toString("hex");
  await prisma.authToken.deleteMany({ where: { userId, type, usedAt: null } });
  await prisma.authToken.create({
    data: { userId, type, tokenHash: hash(raw), expiresAt: new Date(Date.now() + TTL_MS[type]) },
  });
  return raw;
}

/**
 * Validate + consume a token. Returns the userId on success (marking it used so
 * it can't be replayed), or null if it's unknown, wrong-type, expired, or spent.
 */
export async function consumeAuthToken(raw: string, type: AuthTokenType): Promise<string | null> {
  if (!raw) return null;
  const row = await prisma.authToken.findUnique({ where: { tokenHash: hash(raw) } });
  if (!row || row.type !== type || row.usedAt || row.expiresAt < new Date()) return null;
  await prisma.authToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
  return row.userId;
}
