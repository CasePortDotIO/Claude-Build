import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { guaranteeStatus, GUARANTEE_CALLS_DEFAULT, guaranteeThreshold } from "@/lib/guarantee";

const NOW = new Date("2026-06-15T12:00:00Z");
const DAY = 86_400_000;

describe("§8 guarantee tracker", () => {
  const tag = `gtee-${Math.random().toString(36).slice(2, 8)}`;
  let orgId: string;
  let leadId: string;

  async function booking(daysAgo: number) {
    const at = new Date(NOW.getTime() - daysAgo * DAY);
    return prisma.booking.create({
      data: {
        orgId,
        leadId,
        status: "CONFIRMED",
        startsAt: at,
        endsAt: new Date(at.getTime() + 30 * 60_000),
        attendeeEmail: `a-${tag}@x.com`,
        createdAt: at,
      },
    });
  }

  beforeAll(async () => {
    const org = await prisma.org.create({ data: { name: `Org ${tag}`, slug: `org-${tag}`, type: "CLIENT" } });
    orgId = org.id;
    leadId = (await prisma.lead.create({ data: { orgId, email: `l-${tag}@x.com` } })).id;
  });

  afterAll(async () => {
    await prisma.org.delete({ where: { id: orgId } }).catch(() => {});
  });

  it("uses the single default threshold when no override is set", () => {
    expect(guaranteeThreshold({ guaranteeCalls: null })).toBe(GUARANTEE_CALLS_DEFAULT);
    expect(guaranteeThreshold({ guaranteeCalls: 5 })).toBe(5);
  });

  it("counts only bookings inside the rolling 30-day window", async () => {
    await booking(2); // in-window
    await booking(10); // in-window
    await booking(40); // OUT of window
    const s = await guaranteeStatus(orgId, NOW);
    expect(s.booked).toBe(2);
    expect(s.threshold).toBe(GUARANTEE_CALLS_DEFAULT);
    expect(s.met).toBe(false);
    expect(s.remaining).toBe(GUARANTEE_CALLS_DEFAULT - 2);
  });

  it("reports met once the override threshold is reached", async () => {
    await prisma.org.update({ where: { id: orgId }, data: { guaranteeCalls: 2 } });
    const s = await guaranteeStatus(orgId, NOW);
    expect(s.threshold).toBe(2);
    expect(s.met).toBe(true);
    expect(s.remaining).toBe(0);
    expect(s.progressPct).toBe(100);
  });
});
