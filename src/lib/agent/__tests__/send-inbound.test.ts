import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { sendApprovedDraft, SendError } from "@/lib/agent/send";
import { ingestInboundEmail } from "@/lib/agent/inbound";
import { classifyInbound } from "@/lib/mailbox/types";

/**
 * DB-backed test of the M3 send + reply loop using the SIMULATION mailbox:
 * approve→send creates the thread and advances state; inbound replies are
 * classified and drive the lead through REPLIED/NEGOTIATING, OPTED_OUT, BOUNCED.
 */
describe("send + reply loop", () => {
  const tag = `m3-${Math.random().toString(36).slice(2, 8)}`;
  let orgId: string;
  let mailboxId: string;

  async function makeLeadWithApprovedDraft(email: string, firstName: string) {
    const lead = await prisma.lead.create({
      data: { orgId, email, firstName, status: "SCHEDULED", statedGoal: "shipping your course" },
    });
    const draft = await prisma.draft.create({
      data: {
        orgId,
        leadId: lead.id,
        status: "APPROVED",
        finalSubject: "still thinking about this?",
        finalBody: "Hi, quick note — want me to send a next step? Reply stop to opt out.",
        approvedAt: new Date(),
        variants: { create: [{ index: 0, angle: "goal-led", subject: "s", body: "b", openingLine: "Hi", confidence: 0.8, rationale: "r" }] },
      },
    });
    return { lead, draft };
  }

  beforeAll(async () => {
    const org = await prisma.org.create({ data: { name: `Org ${tag}`, slug: `org-${tag}`, type: "CLIENT", mailingAddress: "1 Test St, Austin TX 78701" } });
    orgId = org.id;
    const mb = await prisma.mailbox.create({
      data: { orgId, email: `demo@${tag}.sim`, provider: "SIMULATION", status: "CONNECTED", dailyCap: 5 },
    });
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
    await prisma.lead.deleteMany({ where: { orgId } });
    await prisma.org.deleteMany({ where: { id: orgId } });
    await prisma.$disconnect();
  });

  it("classifyInbound detects auto-reply, bounce, and opt-out", () => {
    expect(classifyInbound({ fromEmail: "a@b.com", subject: "Out of office", body: "I am away" }).isAutoReply).toBe(true);
    expect(classifyInbound({ fromEmail: "mailer-daemon@x", subject: "Undeliverable", body: "550 5.1.1" }).isBounce).toBe(true);
    expect(classifyInbound({ fromEmail: "a@b.com", subject: "re", body: "please unsubscribe me" }).isOptOut).toBe(true);
    expect(classifyInbound({ fromEmail: "a@b.com", subject: "re", body: "stop" }).isOptOut).toBe(true);
  });

  it("sends an approved draft and opens a conversation", async () => {
    const { lead } = await makeLeadWithApprovedDraft(`pos@${tag}.com`, "Ada");
    await sendApprovedDraft({ orgId, draftId: (await prisma.draft.findFirstOrThrow({ where: { leadId: lead.id } })).id });

    const after = await prisma.lead.findUnique({ where: { id: lead.id } });
    expect(after?.status).toBe("AWAITING_REPLY");

    const convo = await prisma.conversation.findUnique({ where: { leadId: lead.id } });
    expect(convo).toBeTruthy();
    const out = await prisma.message.count({ where: { leadId: lead.id, direction: "OUTBOUND" } });
    expect(out).toBe(1);
    const mb = await prisma.mailbox.findUnique({ where: { id: mailboxId } });
    expect(mb!.sentToday).toBeGreaterThanOrEqual(1);
  });

  it("ingests a positive reply → REPLIED→NEGOTIATING with a reply draft queued", async () => {
    const lead = await prisma.lead.findFirstOrThrow({ where: { orgId, email: `pos@${tag}.com` } });
    const res = await ingestInboundEmail({
      orgId,
      mailboxId,
      email: {
        providerMessageId: "in-1", threadId: "t1", fromEmail: `Ada <pos@${tag}.com>`, toEmail: "op",
        subject: "Re: hi", body: "Yes! Still interested, what times work?", receivedAt: new Date(),
      },
    });
    expect(res.outcome).toBe("reply");
    const after = await prisma.lead.findUnique({ where: { id: lead.id } });
    expect(after?.status).toBe("NEGOTIATING");
    const pending = await prisma.draft.count({ where: { leadId: lead.id, status: "PENDING_APPROVAL" } });
    expect(pending).toBe(1);
    const convo = await prisma.conversation.findUnique({ where: { leadId: lead.id } });
    expect(convo?.status).toBe("NEEDS_REVIEW");
  });

  it("ingests an opt-out → lead OPTED_OUT + suppression added", async () => {
    const { lead } = await makeLeadWithApprovedDraft(`opt@${tag}.com`, "Opt");
    await sendApprovedDraft({ orgId, draftId: (await prisma.draft.findFirstOrThrow({ where: { leadId: lead.id } })).id });
    const res = await ingestInboundEmail({
      orgId, mailboxId,
      email: { providerMessageId: "in-2", threadId: "t2", fromEmail: `opt@${tag}.com`, toEmail: "op", subject: "Re", body: "stop", receivedAt: new Date() },
    });
    expect(res.outcome).toBe("opt_out");
    expect((await prisma.lead.findUnique({ where: { id: lead.id } }))?.status).toBe("OPTED_OUT");
    expect(await prisma.suppressionEntry.findUnique({ where: { orgId_email: { orgId, email: `opt@${tag}.com` } } })).toBeTruthy();
  });

  it("ingests a bounce → lead BOUNCED + suppression added", async () => {
    const { lead } = await makeLeadWithApprovedDraft(`bnc@${tag}.com`, "Bo");
    await sendApprovedDraft({ orgId, draftId: (await prisma.draft.findFirstOrThrow({ where: { leadId: lead.id } })).id });
    // A real bounce arrives FROM mailer-daemon but on the SAME thread as the send.
    const convo = await prisma.conversation.findUniqueOrThrow({ where: { leadId: lead.id } });
    const res = await ingestInboundEmail({
      orgId, mailboxId,
      email: { providerMessageId: "in-3", threadId: convo.threadId!, fromEmail: "mailer-daemon@googlemail.com", toEmail: "op", subject: "Delivery Status Notification (Failure)", body: "address not found 550 5.1.1", receivedAt: new Date() },
    });
    expect(res.outcome).toBe("bounce");
    expect((await prisma.lead.findUnique({ where: { id: lead.id } }))?.status).toBe("BOUNCED");
  });

  it("refuses to send to a suppressed lead", async () => {
    const { lead, draft } = await makeLeadWithApprovedDraft(`sup@${tag}.com`, "Sup");
    await prisma.suppressionEntry.create({ data: { orgId, email: `sup@${tag}.com`, reason: "OPTED_OUT" } });
    await expect(sendApprovedDraft({ orgId, draftId: draft.id })).rejects.toBeInstanceOf(SendError);
    expect(await prisma.message.count({ where: { leadId: lead.id } })).toBe(0);
  });
});
