import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { createAuthToken, consumeAuthToken } from "@/lib/auth/tokens";

/**
 * DB-backed test for account-email tokens. Verifies single-use, type-scoping,
 * and expiry — the security guarantees behind password reset / email verify.
 */
describe("auth tokens", () => {
  const tag = `tok-${Math.random().toString(36).slice(2, 8)}`;
  let userId: string;

  beforeAll(async () => {
    const u = await prisma.user.create({ data: { email: `${tag}@x.com`, name: "T", passwordHash: "x" } });
    userId = u.id;
  });

  afterAll(async () => {
    await prisma.authToken.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("is single-use", async () => {
    const raw = await createAuthToken(userId, "PASSWORD_RESET");
    expect(await consumeAuthToken(raw, "PASSWORD_RESET")).toBe(userId);
    expect(await consumeAuthToken(raw, "PASSWORD_RESET")).toBeNull(); // already spent
  });

  it("rejects a wrong-type token", async () => {
    const raw = await createAuthToken(userId, "EMAIL_VERIFY");
    expect(await consumeAuthToken(raw, "PASSWORD_RESET")).toBeNull();
    // still valid for its real type
    expect(await consumeAuthToken(raw, "EMAIL_VERIFY")).toBe(userId);
  });

  it("rejects an expired token and an unknown token", async () => {
    const raw = await createAuthToken(userId, "PASSWORD_RESET");
    await prisma.authToken.updateMany({ where: { userId, type: "PASSWORD_RESET", usedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await consumeAuthToken(raw, "PASSWORD_RESET")).toBeNull();
    expect(await consumeAuthToken("nonexistent-token", "PASSWORD_RESET")).toBeNull();
  });
});
