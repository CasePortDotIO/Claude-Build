import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { grantOneTimeTier, remainingOneTimeQuota } from "@/lib/billing/grant";

describe("one-time quota math", () => {
  it("is unlimited when no quota, else what's left", () => {
    expect(remainingOneTimeQuota(null, 50)).toBe(Number.POSITIVE_INFINITY);
    expect(remainingOneTimeQuota(100, 0)).toBe(100);
    expect(remainingOneTimeQuota(100, 40)).toBe(60);
    expect(remainingOneTimeQuota(100, 100)).toBe(0);
    expect(remainingOneTimeQuota(100, 150)).toBe(0); // never negative
    expect(remainingOneTimeQuota(500, 100)).toBe(400);
  });
});

describe("grantOneTimeTier", () => {
  const tag = `grant-${Math.random().toString(36).slice(2, 8)}`;
  const orgIds: string[] = [];

  async function makeOrg(): Promise<string> {
    const o = await prisma.org.create({ data: { name: `Org ${tag}-${orgIds.length}`, slug: `org-${tag}-${orgIds.length}`, type: "CLIENT" } });
    orgIds.push(o.id);
    return o.id;
  }

  afterAll(async () => {
    for (const id of orgIds) await prisma.org.delete({ where: { id } }).catch(() => {});
  });

  it("founding $27 grants FRONT_END, 100-lead quota, access, and the 3-call guarantee", async () => {
    const orgId = await makeOrg();
    await grantOneTimeTier({ orgId, tier: "FRONT_END", bump: false });
    const org = await prisma.org.findUniqueOrThrow({ where: { id: orgId }, select: { billingStatus: true, planTier: true, oneTimeLeadQuota: true } });
    expect(org.billingStatus).toBe("active");
    expect(org.planTier).toBe("FRONT_END");
    expect(org.oneTimeLeadQuota).toBe(100);
    const guarantee = await prisma.guaranteeLedger.findFirst({ where: { orgId, status: "ACTIVE" } });
    expect(guarantee?.type).toBe("THREE_CALL");
    expect(guarantee?.threshold).toBe(3);
  });

  it("the +$17 bump raises the quota to 500", async () => {
    const orgId = await makeOrg();
    await grantOneTimeTier({ orgId, tier: "FRONT_END", bump: true });
    const org = await prisma.org.findUniqueOrThrow({ where: { id: orgId }, select: { oneTimeLeadQuota: true } });
    expect(org.oneTimeLeadQuota).toBe(500);
  });

  it("own-it $197 grants OTO1 with no lead cap (unlimited)", async () => {
    const orgId = await makeOrg();
    await grantOneTimeTier({ orgId, tier: "OTO1" });
    const org = await prisma.org.findUniqueOrThrow({ where: { id: orgId }, select: { planTier: true, oneTimeLeadQuota: true } });
    expect(org.planTier).toBe("OTO1");
    expect(org.oneTimeLeadQuota).toBeNull();
  });
});
