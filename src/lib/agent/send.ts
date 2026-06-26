import { prisma } from "@/lib/prisma";
import { getMailboxProvider, mailboxContext } from "@/lib/mailbox";
import { transition, TERMINAL_STATES } from "@/lib/agent/state-machine";
import type { Mailbox } from "@prisma/client";

export class SendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SendError";
  }
}

/** Reset a mailbox's daily counter if the window has rolled over. */
async function ensureCapWindow(mailbox: Mailbox): Promise<Mailbox> {
  const now = new Date();
  if (!mailbox.capResetAt || mailbox.capResetAt < now) {
    const next = new Date(now);
    next.setHours(24, 0, 0, 0); // reset at midnight
    return prisma.mailbox.update({
      where: { id: mailbox.id },
      data: { sentToday: 0, capResetAt: next },
    });
  }
  return mailbox;
}

/**
 * Send one APPROVED draft from the org's connected mailbox.
 *
 * Hard rails (never bypassed, even on an "autonomous" sequence):
 *  - lead must not be in a terminal/blocked state,
 *  - lead's email must not be on the suppression list,
 *  - mailbox must be CONNECTED and under its daily cap.
 * On success: send via the provider, record the OUTBOUND Message, upsert the
 * Conversation, advance the lead SCHEDULED → SENT → AWAITING_REPLY, bump the cap.
 */
export async function sendApprovedDraft(opts: { orgId: string; draftId: string }) {
  const { orgId, draftId } = opts;

  const draft = await prisma.draft.findFirst({
    where: { id: draftId, orgId, status: "APPROVED" },
    include: { lead: true },
  });
  if (!draft) throw new SendError("No approved draft found to send.");
  const lead = draft.lead;

  // Compliance rail: never send to a terminal/blocked lead.
  if (TERMINAL_STATES.has(lead.status)) {
    throw new SendError(`Lead is ${lead.status} — sending is blocked by compliance rails.`);
  }
  const suppressed = await prisma.suppressionEntry.findUnique({
    where: { orgId_email: { orgId, email: lead.email } },
  });
  if (suppressed) throw new SendError(`Lead is on the suppression list (${suppressed.reason}); cannot send.`);

  let mailbox = await prisma.mailbox.findFirst({ where: { orgId, status: "CONNECTED" }, orderBy: { createdAt: "asc" } });
  if (!mailbox) throw new SendError("No connected mailbox. Connect one under Connections first.");
  mailbox = await ensureCapWindow(mailbox);
  if (mailbox.sentToday >= mailbox.dailyCap) {
    throw new SendError(`Daily send cap reached for ${mailbox.email} (${mailbox.dailyCap}/day). Try again tomorrow.`);
  }

  // Existing conversation (thread) for this lead, if any.
  const existing = await prisma.conversation.findUnique({ where: { leadId: lead.id } });

  const provider = getMailboxProvider(mailbox.provider);
  const sent = await provider.send(mailboxContext(mailbox), {
    to: lead.email,
    subject: draft.finalSubject ?? "",
    body: draft.finalBody ?? "",
    threadId: existing?.threadId ?? null,
  });

  if (lead.status !== "SCHEDULED") {
    throw new SendError(`Lead must be SCHEDULED to send (is ${lead.status}). Approve the draft first.`);
  }
  const nowSent = transition("SCHEDULED", "SEND"); // → SENT
  const awaiting = transition(nowSent, "DELIVERED"); // → AWAITING_REPLY

  await prisma.$transaction(async (tx) => {
    const convo = await tx.conversation.upsert({
      where: { leadId: lead.id },
      create: {
        orgId,
        leadId: lead.id,
        mailboxId: mailbox!.id,
        threadId: sent.threadId,
        subject: draft.finalSubject ?? "(no subject)",
        status: "AWAITING_REPLY",
        lastOutboundAt: new Date(),
      },
      update: { lastOutboundAt: new Date(), status: "AWAITING_REPLY", threadId: sent.threadId },
    });

    await tx.message.create({
      data: {
        orgId,
        leadId: lead.id,
        mailboxId: mailbox!.id,
        conversationId: convo.id,
        direction: "OUTBOUND",
        status: "SENT",
        providerMessageId: sent.providerMessageId,
        threadId: sent.threadId,
        fromEmail: mailbox!.email,
        toEmail: lead.email,
        subject: draft.finalSubject ?? "",
        body: draft.finalBody ?? "",
        draftId: draft.id,
        sentAt: new Date(),
      },
    });

    await tx.lead.update({ where: { id: lead.id }, data: { status: awaiting, lastTouchAt: new Date() } });
    await tx.mailbox.update({ where: { id: mailbox!.id }, data: { sentToday: { increment: 1 } } });
    await tx.auditLog.create({
      data: { orgId, action: "message.send", targetType: "Lead", targetId: lead.id, metadata: { draftId: draft.id, provider: mailbox!.provider } },
    });
  });

  return { sent, conversationLeadId: lead.id };
}

/** Send every approved-but-unsent draft for an org (respects the daily cap). */
export async function sendAllApproved(orgId: string): Promise<{ sent: number; skipped: { draftId: string; reason: string }[] }> {
  const approved = await prisma.draft.findMany({
    where: { orgId, status: "APPROVED", messages: { none: { direction: "OUTBOUND" } } },
    select: { id: true },
    orderBy: { approvedAt: "asc" },
  });
  let sent = 0;
  const skipped: { draftId: string; reason: string }[] = [];
  for (const d of approved) {
    try {
      await sendApprovedDraft({ orgId, draftId: d.id });
      sent += 1;
    } catch (e) {
      skipped.push({ draftId: d.id, reason: e instanceof Error ? e.message : "error" });
    }
  }
  return { sent, skipped };
}
