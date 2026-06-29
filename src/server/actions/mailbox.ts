"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOrg } from "@/lib/auth-helpers";
import { sendApprovedDraft, sendAllApproved, SendError } from "@/lib/agent/send";
import { ingestInboundEmail } from "@/lib/agent/inbound";
import { reverifyStale } from "@/lib/agent/maintenance";
import { simulatedLeadReply } from "@/lib/mailbox/simulation";
import { getMailboxProvider, getReadyContext, hasGoogleOAuth } from "@/lib/mailbox";

export interface MailboxActionResult {
  ok: boolean;
  error?: string;
  message?: string;
  sent?: number;
}

/** Connect an offline SIMULATION mailbox so the loop is runnable without Google. */
export async function connectSimulationMailboxAction(): Promise<MailboxActionResult> {
  const ctx = await requireOrg();
  const email = `demo@${(await orgSlug(ctx.orgId)) || "workspace"}.sim`;
  await prisma.mailbox.upsert({
    where: { orgId_email: { orgId: ctx.orgId, email } },
    create: { orgId: ctx.orgId, email, provider: "SIMULATION", status: "CONNECTED", dailyCap: 40 },
    update: { status: "CONNECTED" },
  });
  revalidatePath("/connections");
  return { ok: true, message: `Connected simulated mailbox ${email}.` };
}

export async function disconnectMailboxAction(mailboxId: string): Promise<MailboxActionResult> {
  const ctx = await requireOrg();
  await prisma.mailbox.updateMany({ where: { id: mailboxId, orgId: ctx.orgId }, data: { status: "DISCONNECTED" } });
  revalidatePath("/connections");
  return { ok: true, message: "Mailbox disconnected." };
}

/**
 * §4 circuit-breaker reset: the ONLY way a hard-stopped mailbox resumes. Re-scrubs
 * the still-unsent list (§3 verification) FIRST, then clears the rescrub flag,
 * resets the bounce/complaint window so the cleaned list is measured fresh, and
 * reconnects. A naive un-pause is deliberately not offered — one bad list must
 * not be allowed to keep burning the domain.
 */
export async function rescrubAndResumeAction(mailboxId: string): Promise<MailboxActionResult> {
  const ctx = await requireOrg();
  const mb = await prisma.mailbox.findFirst({ where: { id: mailboxId, orgId: ctx.orgId } });
  if (!mb) return { ok: false, error: "Mailbox not found in this workspace." };

  const scrub = await reverifyStale(ctx.orgId, 0); // re-verify everything unsent now
  await prisma.mailbox.update({
    where: { id: mb.id },
    data: { status: "CONNECTED", pausedReason: null, requiresRescrub: false, bounceCount: 0, complaintCount: 0 },
  });
  await prisma.auditLog.create({
    data: { orgId: ctx.orgId, actorId: ctx.userId, action: "mailbox.rescrub_resume", targetType: "Mailbox", targetId: mb.id, metadata: { rechecked: scrub.rechecked, newlyInvalid: scrub.newlyInvalid } },
  });
  revalidatePath("/deliverability");
  revalidatePath("/connections");
  return { ok: true, message: `List re-scrubbed (${scrub.rechecked} re-checked, ${scrub.newlyInvalid} removed). Sending resumed.` };
}

/** Send one approved draft now (the irreversible action — gated by approval). */
export async function sendDraftAction(draftId: string): Promise<MailboxActionResult> {
  const ctx = await requireOrg();
  try {
    await sendApprovedDraft({ orgId: ctx.orgId, draftId });
  } catch (e) {
    if (e instanceof SendError) return { ok: false, error: e.message };
    throw e;
  }
  revalidatePath("/conversations");
  revalidatePath("/leads");
  revalidatePath("/approvals");
  return { ok: true, message: "Sent from your mailbox." };
}

export async function sendAllApprovedAction(): Promise<MailboxActionResult> {
  const ctx = await requireOrg();
  const res = await sendAllApproved(ctx.orgId);
  revalidatePath("/conversations");
  revalidatePath("/leads");
  return { ok: true, sent: res.sent, message: `Sent ${res.sent}; skipped ${res.skipped.length}.` };
}

/**
 * Simulate an inbound reply on a conversation (offline demo of reply detection).
 * `kind` lets the demo exercise each branch: positive reply, opt-out, or bounce.
 */
export async function simulateReplyAction(opts: {
  leadId: string;
  kind?: "positive" | "negative" | "optout" | "bounce";
}): Promise<MailboxActionResult> {
  const ctx = await requireOrg();
  const { leadId, kind = "positive" } = opts;

  const lead = await prisma.lead.findFirst({ where: { id: leadId, orgId: ctx.orgId } });
  if (!lead) return { ok: false, error: "Lead not found." };
  const convo = await prisma.conversation.findUnique({ where: { leadId } });
  if (!convo) return { ok: false, error: "No conversation yet — send the first message first." };

  let body: string;
  let fromEmail = `${lead.firstName ?? "Lead"} <${lead.email}>`;
  if (kind === "optout") body = "stop";
  else if (kind === "bounce") {
    body = "Delivery Status Notification (Failure): address not found. 550 5.1.1 recipient rejected.";
    fromEmail = "Mail Delivery Subsystem <mailer-daemon@googlemail.com>";
  } else body = simulatedLeadReply({ firstName: lead.firstName, goal: lead.statedGoal, positive: kind !== "negative" });

  const result = await ingestInboundEmail({
    orgId: ctx.orgId,
    mailboxId: convo.mailboxId,
    email: {
      providerMessageId: `siminbound-${leadId}-${Date.now()}`,
      threadId: convo.threadId ?? `simthread-${leadId}`,
      inReplyTo: null,
      fromEmail,
      toEmail: "operator",
      subject: `Re: ${convo.subject}`,
      body,
      receivedAt: new Date(),
    },
  });

  revalidatePath("/conversations");
  revalidatePath("/approvals");
  revalidatePath("/leads");
  return { ok: true, message: `Reply ingested → ${result.outcome.replace("_", " ")}.` };
}

/** Pull new replies for real Gmail mailboxes (no-op for simulation). */
export async function syncMailboxesAction(): Promise<MailboxActionResult> {
  const ctx = await requireOrg();
  if (!hasGoogleOAuth()) return { ok: true, message: "No live mailbox to sync. Use Simulate reply for the demo." };

  const mailboxes = await prisma.mailbox.findMany({ where: { orgId: ctx.orgId, status: "CONNECTED", provider: "GMAIL" } });
  let ingested = 0;
  for (const mb of mailboxes) {
    const provider = getMailboxProvider(mb.provider);
    const { messages, cursor } = await provider.fetchNewMessages(await getReadyContext(mb), mb.syncCursor);
    for (const email of messages) {
      const res = await ingestInboundEmail({ orgId: ctx.orgId, mailboxId: mb.id, email });
      if (res.outcome !== "unmatched") ingested += 1;
    }
    await prisma.mailbox.update({ where: { id: mb.id }, data: { lastSyncAt: new Date(), syncCursor: cursor } });
  }
  revalidatePath("/conversations");
  return { ok: true, message: `Synced ${mailboxes.length} mailbox(es); ingested ${ingested} reply(ies).` };
}

async function orgSlug(orgId: string): Promise<string | null> {
  const org = await prisma.org.findUnique({ where: { id: orgId }, select: { slug: true } });
  return org?.slug ?? null;
}
