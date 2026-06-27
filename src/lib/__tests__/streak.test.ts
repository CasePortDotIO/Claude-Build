import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { engagementStreak } from "@/lib/streak";

const DAY = 86_400_000;
const NOW = new Date("2026-06-15T12:00:00Z"); // fixed clock for determinism

describe("engagement streak (M10)", () => {
  const tag = `streak-${Math.random().toString(36).slice(2, 8)}`;
  let orgId: string;

  beforeAll(async () => {
    const org = await prisma.org.create({ data: { name: `Org ${tag}`, slug: `org-${tag}`, type: "CLIENT" } });
    orgId = org.id;
  });

  afterAll(async () => {
    await prisma.org.delete({ where: { id: orgId } }).catch(() => {});
  });

  async function logOn(daysAgo: number, action = "draft.approve") {
    await prisma.auditLog.create({
      data: { orgId, action, targetType: "Draft", createdAt: new Date(NOW.getTime() - daysAgo * DAY) },
    });
  }

  it("is zero with no engagement", async () => {
    const s = await engagementStreak(orgId, NOW);
    expect(s.current).toBe(0);
    expect(s.activeToday).toBe(false);
    expect(s.week).toHaveLength(7);
  });

  it("counts consecutive days ending today and reflects activeToday", async () => {
    await logOn(0); // today
    await logOn(1);
    await logOn(2);
    const s = await engagementStreak(orgId, NOW);
    expect(s.current).toBe(3);
    expect(s.activeToday).toBe(true);
    expect(s.atRisk).toBe(false);
    expect(s.week[6].active).toBe(true); // today is last
  });

  it("stays alive (grace) when active yesterday but not yet today, and flags atRisk", async () => {
    // New org so the chain is clean: active yesterday + day before, nothing today.
    const org2 = await prisma.org.create({ data: { name: `O2 ${tag}`, slug: `o2-${tag}`, type: "CLIENT" } });
    await prisma.auditLog.createMany({
      data: [
        { orgId: org2.id, action: "draft.reject", targetType: "Draft", createdAt: new Date(NOW.getTime() - 1 * DAY) },
        { orgId: org2.id, action: "lead.import", targetType: "LeadImport", createdAt: new Date(NOW.getTime() - 2 * DAY) },
      ],
    });
    const s = await engagementStreak(org2.id, NOW);
    expect(s.current).toBe(2);
    expect(s.activeToday).toBe(false);
    expect(s.atRisk).toBe(true);
    await prisma.org.delete({ where: { id: org2.id } }).catch(() => {});
  });

  it("breaks the streak when the gap is more than one day", async () => {
    const org3 = await prisma.org.create({ data: { name: `O3 ${tag}`, slug: `o3-${tag}`, type: "CLIENT" } });
    // active 3 and 4 days ago only — a 2-day gap to today, so no live streak.
    await prisma.auditLog.createMany({
      data: [
        { orgId: org3.id, action: "draft.approve", targetType: "Draft", createdAt: new Date(NOW.getTime() - 3 * DAY) },
        { orgId: org3.id, action: "draft.approve", targetType: "Draft", createdAt: new Date(NOW.getTime() - 4 * DAY) },
      ],
    });
    const s = await engagementStreak(org3.id, NOW);
    expect(s.current).toBe(0);
    expect(s.longest).toBe(2); // the broken run still counts toward "best"
    await prisma.org.delete({ where: { id: org3.id } }).catch(() => {});
  });

  it("ignores non-engagement audit actions", async () => {
    const org4 = await prisma.org.create({ data: { name: `O4 ${tag}`, slug: `o4-${tag}`, type: "CLIENT" } });
    await prisma.auditLog.create({
      data: { orgId: org4.id, action: "brief.email", targetType: "Org", createdAt: NOW },
    });
    const s = await engagementStreak(org4.id, NOW);
    expect(s.current).toBe(0);
    await prisma.org.delete({ where: { id: org4.id } }).catch(() => {});
  });
});
