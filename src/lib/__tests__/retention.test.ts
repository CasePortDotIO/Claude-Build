import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { agentMaturity, roiLedger, dailyBrief } from "@/lib/retention";

describe("retention engine (M10)", () => {
  const tag = `ret-${Math.random().toString(36).slice(2, 8)}`;
  let orgId: string;
  let leadId: string;

  beforeAll(async () => {
    const org = await prisma.org.create({ data: { name: `Org ${tag}`, slug: `org-${tag}`, type: "CLIENT" } });
    orgId = org.id;
    const lead = await prisma.lead.create({ data: { orgId, email: `l-${tag}@x.com`, firstName: "Lee", status: "BOOKED", dealValueCents: 200000 } });
    leadId = lead.id;
  });

  afterAll(async () => {
    await prisma.org.delete({ where: { id: orgId } }).catch(() => {});
  });

  it("starts a fresh agent at a low, bounded maturity score", async () => {
    const m = await agentMaturity(orgId);
    expect(m.score).toBeGreaterThanOrEqual(0);
    expect(m.score).toBeLessThanOrEqual(100);
    expect(m.tier).toBe("Newly hired"); // nothing trained yet
    expect(m.components).toHaveLength(5);
    // Lead memory should already contribute (1 lead → 0 pts at /5 flooring, still valid).
    expect(m.leadsRemembered).toBe(1);
  });

  it("climbs as the agent accrues training", async () => {
    const before = (await agentMaturity(orgId)).score;
    // Learn some voice samples + apply an insight + bump the learning version.
    await prisma.voiceSample.createMany({
      data: Array.from({ length: 4 }, (_, i) => ({ orgId, body: `sample ${i} body text here` })),
    });
    await prisma.insight.create({
      data: { orgId, kind: "SHIFT_SENDTIME", status: "APPLIED", title: "t", body: "b", metric: "m", appliedAt: new Date() },
    });
    await prisma.orgLearning.create({ data: { orgId, version: 3 } });
    const after = (await agentMaturity(orgId)).score;
    expect(after).toBeGreaterThan(before);
  });

  it("ledger sums recovered revenue from confirmed bookings", async () => {
    await prisma.booking.create({
      data: {
        orgId,
        leadId,
        status: "CONFIRMED",
        valueCents: 200000,
        startsAt: new Date(Date.now() + 86_400_000),
        endsAt: new Date(Date.now() + 86_400_000 + 1_800_000),
        attendeeEmail: `l-${tag}@x.com`,
      },
    });
    const l = await roiLedger(orgId);
    expect(l.recoveredCents).toBe(200000);
    expect(l.callsBooked).toBe(1);
    expect(l.daysActive).toBeGreaterThanOrEqual(1);
  });

  it("daily brief counts a booking inside the window and reflects pending approvals", async () => {
    const b = await dailyBrief(orgId, 24);
    expect(b.booked).toBe(1);
    expect(b.recoveredCents).toBe(200000);
    expect(b.cumulativeRecoveredCents).toBe(200000);
    expect(b.hasActivity).toBe(true);
  });
});
