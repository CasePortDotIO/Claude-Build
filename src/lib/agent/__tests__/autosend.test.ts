import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { autoApproveAndSend, AUTO_SEND_MIN_CONFIDENCE } from "@/lib/agent/autosend";

/**
 * DB-backed test for auto-send mode's safety gate. Verifies:
 *  - a confident draft (>= threshold) is auto-approved (and leaves the queue),
 *  - a low-confidence draft is HELD for human review,
 *  - with no connected mailbox, nothing is approved (drafts wait).
 */
describe("auto-send safety gate", () => {
  const tag = `as-${Math.random().toString(36).slice(2, 8)}`;
  let orgId: string;
  let mailboxId: string;

  async function leadWithDraft(key: string, confidence: number) {
    const lead = await prisma.lead.create({
      data: { orgId, email: `${key}@${tag}.com`, firstName: "Lead", status: "DRAFTED", reachability: "REACHABLE" },
    });
    await prisma.draft.create({
      data: {
        orgId,
        leadId: lead.id,
        status: "PENDING_APPROVAL",
        variants: { create: [{ index: 0, angle: "goal-led", subject: "s", body: "b", openingLine: "o", confidence, rationale: "r" }] },
      },
    });
    return lead;
  }

  beforeAll(async () => {
    const org = await prisma.org.create({ data: { name: `Org ${tag}`, slug: `org-${tag}`, type: "CLIENT" } });
    orgId = org.id;
    const mb = await prisma.mailbox.create({ data: { orgId, email: `m@${tag}.sim`, provider: "SIMULATION", status: "CONNECTED" } });
    mailboxId = mb.id;
  });

  afterAll(async () => {
    await prisma.message.deleteMany({ where: { orgId } });
    await prisma.draft.deleteMany({ where: { orgId } });
    await prisma.mailbox.deleteMany({ where: { orgId } });
    await prisma.lead.deleteMany({ where: { orgId } });
    await prisma.auditLog.deleteMany({ where: { orgId } });
    await prisma.org.deleteMany({ where: { id: orgId } });
    await prisma.$disconnect();
  });

  it("auto-approves confident drafts and holds low-confidence ones", async () => {
    const hi = await leadWithDraft("hi", Math.min(0.99, AUTO_SEND_MIN_CONFIDENCE + 0.2));
    const lo = await leadWithDraft("lo", AUTO_SEND_MIN_CONFIDENCE - 0.2);

    const res = await autoApproveAndSend({ orgId });
    expect(res.approved).toBeGreaterThanOrEqual(1);
    expect(res.heldForReview).toBeGreaterThanOrEqual(1);

    // Confident draft left the queue (APPROVED or already SENT).
    const hiDraft = await prisma.draft.findFirst({ where: { orgId, leadId: hi.id } });
    expect(hiDraft?.status).not.toBe("PENDING_APPROVAL");

    // Low-confidence draft still waits for a human.
    const loDraft = await prisma.draft.findFirst({ where: { orgId, leadId: lo.id } });
    expect(loDraft?.status).toBe("PENDING_APPROVAL");
  });

  it("does nothing without a connected mailbox", async () => {
    await prisma.mailbox.update({ where: { id: mailboxId }, data: { status: "DISCONNECTED" } });
    const x = await leadWithDraft("nomail", 0.95);

    const res = await autoApproveAndSend({ orgId });
    expect(res.approved).toBe(0);

    const d = await prisma.draft.findFirst({ where: { orgId, leadId: x.id } });
    expect(d?.status).toBe("PENDING_APPROVAL");

    await prisma.mailbox.update({ where: { id: mailboxId }, data: { status: "CONNECTED" } });
  });
});
