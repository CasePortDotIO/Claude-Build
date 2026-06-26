import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { assertContactable, ComplianceError } from "@/lib/compliance";
import { eraseLead } from "@/lib/compliance/gdpr";
import { sendApprovedDraft, SendError } from "@/lib/agent/send";
import { ingestInboundEmail } from "@/lib/agent/inbound";

/**
 * DB-backed M5 compliance flow: contactability gate, GDPR erasure, CAN-SPAM
 * address requirement, and mailbox auto-pause when bounces cross the threshold.
 */
describe("compliance flow", () => {
  const tag = `comp-${Math.random().toString(36).slice(2, 8)}`;
  let orgId: string;
  let mailboxId: string;

  beforeAll(async () => {
    const org = await prisma.org.create({ data: { name: `Org ${tag}`, slug: `org-${tag}`, type: "CLIENT", mailingAddress: "1 Main St, Austin TX 78701" } });
    orgId = org.id;
    const mb = await prisma.mailbox.create({ data: { orgId, email: `m@${tag}.sim`, provider: "SIMULATION", status: "CONNECTED" } });
    mailboxId = mb.id;
  });

  afterAll(async () => {
    await prisma.message.deleteMany({ where: { orgId } });
    await prisma.conversation.deleteMany({ where: { orgId } });
    await prisma.draft.deleteMany({ where: { orgId } });
    await prisma.agentRun.deleteMany({ where: { orgId } });
    await prisma.memoryEmbedding.deleteMany({ where: { orgId } });
    await prisma.suppressionEntry.deleteMany({ where: { orgId } });
    await prisma.mailbox.deleteMany({ where: { orgId } });
    await prisma.auditLog.deleteMany({ where: { orgId } });
    await prisma.lead.deleteMany({ where: { orgId } });
    await prisma.org.deleteMany({ where: { id: orgId } });
    await prisma.$disconnect();
  });

  it("contactability gate blocks suppressed + opted-out leads", async () => {
    const lead = await prisma.lead.create({ data: { orgId, email: `ok@${tag}.com`, status: "NEW" } });
    await expect(assertContactable(orgId, lead.email, "NEW")).resolves.toBeUndefined();

    await expect(assertContactable(orgId, lead.email, "OPTED_OUT")).rejects.toBeInstanceOf(ComplianceError);

    await prisma.suppressionEntry.create({ data: { orgId, email: lead.email, reason: "MANUAL" } });
    await expect(assertContactable(orgId, lead.email, "NEW")).rejects.toBeInstanceOf(ComplianceError);
  });

  it("requires a mailing address before sending (CAN-SPAM)", async () => {
    // Temporarily clear the org address.
    await prisma.org.update({ where: { id: orgId }, data: { mailingAddress: null } });
    const lead = await prisma.lead.create({ data: { orgId, email: `addr@${tag}.com`, status: "SCHEDULED" } });
    const draft = await prisma.draft.create({ data: { orgId, leadId: lead.id, status: "APPROVED", finalSubject: "s", finalBody: "b" } });
    await expect(sendApprovedDraft({ orgId, draftId: draft.id })).rejects.toThrow(SendError);
    await prisma.org.update({ where: { id: orgId }, data: { mailingAddress: "1 Main St, Austin TX 78701" } });
  });

  it("appends the CAN-SPAM footer to the sent message", async () => {
    const lead = await prisma.lead.create({ data: { orgId, email: `foot@${tag}.com`, status: "SCHEDULED" } });
    const draft = await prisma.draft.create({ data: { orgId, leadId: lead.id, status: "APPROVED", finalSubject: "hi", finalBody: "Hello there." } });
    await sendApprovedDraft({ orgId, draftId: draft.id });
    const msg = await prisma.message.findFirstOrThrow({ where: { leadId: lead.id, direction: "OUTBOUND" } });
    expect(msg.body).toContain("Unsubscribe instantly:");
    expect(msg.body).toContain("Austin TX");
  });

  it("erases a lead and keeps the email on do-not-contact (GDPR)", async () => {
    const lead = await prisma.lead.create({ data: { orgId, email: `erase@${tag}.com`, status: "NEW" } });
    const res = await eraseLead(orgId, lead.id);
    expect(res.erased).toBe(true);
    expect(await prisma.lead.findUnique({ where: { id: lead.id } })).toBeNull();
    const sup = await prisma.suppressionEntry.findUnique({ where: { orgId_email: { orgId, email: `erase@${tag}.com` } } });
    expect(sup?.reason).toBe("DO_NOT_CONTACT");
  });

  it("auto-pauses the mailbox when the bounce rate crosses the threshold", async () => {
    // Pre-load history so one more bounce tips past 5%.
    await prisma.mailbox.update({ where: { id: mailboxId }, data: { sentTotal: 100, bounceCount: 5 } });
    const lead = await prisma.lead.create({ data: { orgId, email: `bnc@${tag}.com`, status: "AWAITING_REPLY" } });
    const convo = await prisma.conversation.create({ data: { orgId, leadId: lead.id, mailboxId, subject: "Re", threadId: `th-${tag}`, status: "AWAITING_REPLY" } });
    await ingestInboundEmail({
      orgId, mailboxId,
      email: { providerMessageId: "b1", threadId: convo.threadId!, fromEmail: "mailer-daemon@x", toEmail: "op", subject: "Undeliverable", body: "550 5.1.1 address not found", receivedAt: new Date() },
    });
    const mb = await prisma.mailbox.findUniqueOrThrow({ where: { id: mailboxId } });
    expect(mb.bounceCount).toBe(6);
    expect(mb.status).toBe("PAUSED");
    expect(mb.pausedReason).toMatch(/Bounce rate/);
  });
});
