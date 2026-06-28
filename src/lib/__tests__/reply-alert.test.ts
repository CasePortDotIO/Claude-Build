import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { notifyReply } from "@/lib/notify";
import { commandCenterKpis } from "@/lib/metrics";

/**
 * Covers the two speed/visibility levers added in this pass:
 *  - notifyReply: the real-time "someone replied" alert (audit always; Slack
 *    best-effort, no-op without a webhook),
 *  - commandCenterKpis: the hero metric scoped to the current month while
 *    all-time keeps the full total.
 */
describe("reply alerts + month-scoped recovered revenue", () => {
  const tag = `reply-${Math.random().toString(36).slice(2, 8)}`;
  let orgId: string;
  let leadId: string;

  beforeAll(async () => {
    const org = await prisma.org.create({ data: { name: `Org ${tag}`, slug: `org-${tag}`, type: "CLIENT" } });
    orgId = org.id;
    const lead = await prisma.lead.create({
      data: { orgId, email: `lead@${tag}.com`, firstName: "Dana", status: "REPLIED", dealValueCents: 300000 },
    });
    leadId = lead.id;
  });

  afterAll(async () => {
    await prisma.booking.deleteMany({ where: { orgId } });
    await prisma.auditLog.deleteMany({ where: { orgId } });
    await prisma.lead.deleteMany({ where: { orgId } });
    await prisma.org.deleteMany({ where: { id: orgId } });
    await prisma.$disconnect();
  });

  it("records an audit event and no-ops Slack when no webhook is configured", async () => {
    const res = await notifyReply({
      orgId,
      leadName: "Dana Klein",
      snippet: "Yes, still interested — what are your rates?",
      needsReview: false,
    });
    expect(res.slack).toBe(false);

    const log = await prisma.auditLog.findFirst({ where: { orgId, action: "reply.notify" } });
    expect(log).not.toBeNull();
    expect((log?.metadata as { leadName?: string })?.leadName).toBe("Dana Klein");
  });

  it("scopes the hero metric to the current month while all-time keeps the full total", async () => {
    const base = {
      orgId,
      leadId,
      attendeeEmail: `lead@${tag}.com`,
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 1_800_000),
      status: "CONFIRMED" as const,
    };
    // One booking ~2 months ago (prior month), one now (this month).
    await prisma.booking.create({ data: { ...base, valueCents: 100000, createdAt: new Date(Date.now() - 60 * 86_400_000) } });
    await prisma.booking.create({ data: { ...base, valueCents: 250000 } });

    const kpis = await commandCenterKpis(orgId);
    expect(kpis.recoveredRevenueCents).toBe(350000); // all-time: both
    expect(kpis.recoveredThisMonthCents).toBe(250000); // current month only
    expect(kpis.callsBookedThisMonth).toBe(1);
    expect(kpis.callsBooked).toBe(2);
  });
});
