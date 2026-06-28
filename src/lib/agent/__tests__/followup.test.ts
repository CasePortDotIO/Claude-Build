import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { runFollowupsForOrg, MAX_TOUCHES } from "@/lib/agent/followup";

/**
 * DB-backed follow-up test (stub provider, no API key). Verifies:
 *  - a sent-but-quiet lead past the gap gets a follow-up draft queued for approval,
 *  - a lead sent too recently is left alone (gap honoured),
 *  - a lead that has exhausted its touches is closed, not re-drafted.
 */
describe("follow-up engine", () => {
  const tag = `fu-${Math.random().toString(36).slice(2, 8)}`;
  let orgId: string;
  let mailboxId: string;

  const DAY_MS = 86_400_000;

  async function seedLead(opts: { key: string; sentDaysAgo: number; touches: number }) {
    const lead = await prisma.lead.create({
      data: {
        orgId,
        email: `${opts.key}@${tag}.com`,
        firstName: "Lead",
        status: "AWAITING_REPLY",
        reachability: "REACHABLE",
        statedGoal: "getting back on track",
        lastTouchAt: new Date(Date.now() - opts.sentDaysAgo * DAY_MS),
      },
    });
    for (let i = 0; i < opts.touches; i++) {
      await prisma.message.create({
        data: {
          orgId,
          leadId: lead.id,
          mailboxId,
          direction: "OUTBOUND",
          status: "SENT",
          fromEmail: `m@${tag}.sim`,
          toEmail: lead.email,
          subject: `touch ${i + 1}`,
          body: "b",
          sentAt: new Date(Date.now() - opts.sentDaysAgo * DAY_MS),
        },
      });
    }
    return lead;
  }

  beforeAll(async () => {
    const org = await prisma.org.create({ data: { name: `Org ${tag}`, slug: `org-${tag}`, type: "CLIENT" } });
    orgId = org.id;
    const mb = await prisma.mailbox.create({ data: { orgId, email: `m@${tag}.sim`, provider: "SIMULATION", status: "CONNECTED" } });
    mailboxId = mb.id;
    await prisma.orgLearning.create({ data: { orgId, followUpGapDays: 3 } });
  });

  afterAll(async () => {
    await prisma.message.deleteMany({ where: { orgId } });
    await prisma.draft.deleteMany({ where: { orgId } });
    await prisma.agentRun.deleteMany({ where: { orgId } });
    await prisma.orgLearning.deleteMany({ where: { orgId } });
    await prisma.mailbox.deleteMany({ where: { orgId } });
    await prisma.lead.deleteMany({ where: { orgId } });
    await prisma.org.deleteMany({ where: { id: orgId } });
    await prisma.$disconnect();
  });

  it("queues a follow-up draft for a quiet lead past the gap, and leaves recent ones alone", async () => {
    const due = await seedLead({ key: "due", sentDaysAgo: 4, touches: 1 }); // past the 3-day gap
    const recent = await seedLead({ key: "recent", sentDaysAgo: 1, touches: 1 }); // inside the gap

    const res = await runFollowupsForOrg(orgId);
    expect(res.generated).toBeGreaterThanOrEqual(1);

    // Due lead advanced to AWAITING_APPROVAL with a pending follow-up draft.
    expect((await prisma.lead.findUnique({ where: { id: due.id } }))?.status).toBe("AWAITING_APPROVAL");
    expect(await prisma.draft.count({ where: { orgId, leadId: due.id, status: "PENDING_APPROVAL" } })).toBe(1);

    // Recent lead untouched.
    expect((await prisma.lead.findUnique({ where: { id: recent.id } }))?.status).toBe("AWAITING_REPLY");
    expect(await prisma.draft.count({ where: { orgId, leadId: recent.id } })).toBe(0);
  });

  it("closes a lead that has exhausted its touches instead of drafting again", async () => {
    const maxed = await seedLead({ key: "maxed", sentDaysAgo: 5, touches: MAX_TOUCHES });

    const res = await runFollowupsForOrg(orgId);
    expect(res.closed).toBeGreaterThanOrEqual(1);

    expect((await prisma.lead.findUnique({ where: { id: maxed.id } }))?.status).toBe("CLOSED_LOST");
    expect(await prisma.draft.count({ where: { orgId, leadId: maxed.id } })).toBe(0);
  });
});
