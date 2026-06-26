import { prisma } from "@/lib/prisma";
import { classifyInbound, type InboundEmail } from "@/lib/mailbox/types";
import { getLLMProvider } from "@/lib/ai/provider";
import { estimateCostUsd } from "@/lib/ai/config";
import { defaultVoiceProfile } from "@/lib/agent/voice";
import { buildOptOutLine } from "@/lib/agent/draft";
import { transition, canTransition } from "@/lib/agent/state-machine";
import { availabilityLabels } from "@/lib/agent/booking";
import { storeMemory } from "@/lib/memory";
import type { ThreadTurn, VoiceProfileShape } from "@/lib/ai/types";

export interface IngestResult {
  outcome: "reply" | "auto_reply" | "bounce" | "opt_out" | "unmatched";
  leadId?: string;
  conversationId?: string;
  replyDraftId?: string;
}

/**
 * Ingest one inbound email (§7 reply detection). Matches it to a lead by
 * address, classifies it (auto-reply / bounce / opt-out / genuine), records the
 * INBOUND message, and advances the loop:
 *  - bounce   → lead BOUNCED + suppression(BOUNCED), conversation closed,
 *  - opt-out  → lead OPTED_OUT + suppression(OPTED_OUT), conversation closed,
 *  - auto-reply → recorded only, no state change,
 *  - genuine  → lead → REPLIED, then draft a reply (queued for approval) →
 *               NEGOTIATING, conversation → NEEDS_REVIEW.
 * All writes are org-scoped.
 */
export async function ingestInboundEmail(opts: {
  orgId: string;
  mailboxId: string;
  email: InboundEmail;
}): Promise<IngestResult> {
  const { orgId, mailboxId, email } = opts;
  const fromAddr = extractAddress(email.fromEmail);

  // Match to a lead: first by the sender address; if that fails (e.g. a bounce
  // arrives FROM mailer-daemon, not the lead), fall back to the email thread.
  let lead = await prisma.lead.findFirst({ where: { orgId, email: fromAddr } });
  let conversation = lead ? await prisma.conversation.findUnique({ where: { leadId: lead.id } }) : null;

  if (!lead && email.threadId) {
    conversation = await prisma.conversation.findFirst({ where: { orgId, threadId: email.threadId } });
    if (conversation) lead = await prisma.lead.findUnique({ where: { id: conversation.leadId } });
  }
  if (!lead) return { outcome: "unmatched" };

  conversation =
    conversation ??
    (await prisma.conversation.create({
      data: { orgId, leadId: lead.id, mailboxId, threadId: email.threadId, subject: email.subject, status: "ACTIVE" },
    }));

  const flags = classifyInbound(email);

  // Record the inbound message regardless of classification.
  await prisma.message.create({
    data: {
      orgId,
      leadId: lead.id,
      mailboxId,
      conversationId: conversation.id,
      direction: "INBOUND",
      status: "RECEIVED",
      providerMessageId: email.providerMessageId,
      threadId: email.threadId,
      inReplyTo: email.inReplyTo ?? undefined,
      fromEmail: email.fromEmail,
      toEmail: email.toEmail,
      subject: email.subject,
      body: email.body,
      isAutoReply: flags.isAutoReply,
      isBounce: flags.isBounce,
      isOptOut: flags.isOptOut,
      receivedAt: email.receivedAt,
    },
  });

  // ── Bounce: hard stop + suppress ──
  if (flags.isBounce) {
    await applyTerminal(lead.id, "BOUNCE", "BOUNCED", conversation.id, "CLOSED");
    await suppress(orgId, lead.email, "BOUNCED");
    return { outcome: "bounce", leadId: lead.id, conversationId: conversation.id };
  }

  // ── Opt-out: honor instantly + permanently ──
  if (flags.isOptOut) {
    await applyTerminal(lead.id, "OPT_OUT", "OPTED_OUT", conversation.id, "CLOSED");
    await suppress(orgId, lead.email, "OPTED_OUT");
    return { outcome: "opt_out", leadId: lead.id, conversationId: conversation.id };
  }

  // ── Auto-reply: record only, no advance ──
  if (flags.isAutoReply) {
    await prisma.conversation.update({ where: { id: conversation.id }, data: { lastInboundAt: email.receivedAt } });
    return { outcome: "auto_reply", leadId: lead.id, conversationId: conversation.id };
  }

  // ── Genuine reply: advance + draft a response for approval ──
  if (canTransition(lead.status, "REPLY")) {
    await prisma.lead.update({ where: { id: lead.id }, data: { status: transition(lead.status, "REPLY") } });
  }
  // Memory: the lead's own words are valuable signal.
  await storeMemory({ orgId, kind: "LEAD_REPLY", content: email.body, leadId: lead.id });

  const replyDraftId = await draftReplyForApproval({ orgId, leadId: lead.id, conversationId: conversation.id, theirReply: email.body });

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastInboundAt: email.receivedAt, status: "NEEDS_REVIEW" },
  });

  return { outcome: "reply", leadId: lead.id, conversationId: conversation.id, replyDraftId };
}

/** Draft a reply to a lead's message and queue it for approval (NEGOTIATING). */
async function draftReplyForApproval(opts: {
  orgId: string;
  leadId: string;
  conversationId: string;
  theirReply: string;
}): Promise<string> {
  const start = Date.now();
  const { orgId, leadId, conversationId, theirReply } = opts;

  const [lead, org, profile, history, availability] = await Promise.all([
    prisma.lead.findUniqueOrThrow({ where: { id: leadId } }),
    prisma.org.findUniqueOrThrow({ where: { id: orgId } }),
    prisma.voiceProfile.findUnique({ where: { orgId } }),
    prisma.message.findMany({ where: { conversationId }, orderBy: { createdAt: "asc" } }),
    availabilityLabels(orgId),
  ]);

  const voice: VoiceProfileShape = profile
    ? {
        tone: profile.tone, sentenceLength: profile.sentenceLength, emojiUse: profile.emojiUse,
        greeting: profile.greeting, signOff: profile.signOff, signatureMove: profile.signatureMove,
        summary: profile.summary, doRules: profile.doRules, dontRules: profile.dontRules,
      }
    : defaultVoiceProfile();

  const thread: ThreadTurn[] = history.map((m) => ({
    who: m.direction === "OUTBOUND" ? "operator" : "lead",
    text: m.body,
  }));

  const provider = getLLMProvider();
  const result = await provider.draftReply({
    lead: { firstName: lead.firstName, company: lead.company, originalInquiry: lead.originalInquiry, statedGoal: lead.statedGoal, toneRead: lead.toneRead, objections: lead.objections ?? [] },
    voice,
    operatorName: org.brandName || org.name,
    optOutLine: buildOptOutLine(),
    thread,
    theirReply,
    availability, // real calendar slots from the connected calendar (M4)
    variantCount: 2,
  });

  const draft = await prisma.$transaction(async (tx) => {
    const run = await tx.agentRun.create({
      data: {
        orgId, leadId, step: "REPLY", provider: result.provider, model: result.model,
        inputSummary: `Reply to "${theirReply.slice(0, 60)}" (${thread.length} prior turns)`,
        decision: { overallRationale: result.overallRationale } as object,
        rationale: result.overallRationale,
        confidence: result.variants[0]?.confidence ?? null,
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
        costUsd: result.provider === "anthropic" ? estimateCostUsd(result.model, result.usage.promptTokens, result.usage.completionTokens) : 0,
        latencyMs: Date.now() - start,
      },
    });

    await tx.draft.updateMany({ where: { orgId, leadId, status: "PENDING_APPROVAL" }, data: { status: "SUPERSEDED" } });

    const created = await tx.draft.create({
      data: {
        orgId, leadId, status: "PENDING_APPROVAL", agentRunId: run.id,
        variants: { create: result.variants.map((v, i) => ({ index: i, angle: v.angle, subject: v.subject, body: v.body, openingLine: v.openingLine, confidence: v.confidence, rationale: v.rationale })) },
      },
      include: { variants: { orderBy: { index: "asc" } } },
    });
    const best = [...created.variants].sort((a, b) => b.confidence - a.confidence)[0];
    await tx.draft.update({ where: { id: created.id }, data: { selectedVariantId: best?.id } });

    // Lead REPLIED → NEGOTIATING (a reply draft is in flight).
    if (canTransition("REPLIED", "NEGOTIATE")) {
      await tx.lead.update({ where: { id: leadId }, data: { status: "NEGOTIATING" } });
    }
    return created;
  });

  return draft.id;
}

async function applyTerminal(
  leadId: string,
  event: "BOUNCE" | "OPT_OUT",
  forced: "BOUNCED" | "OPTED_OUT",
  conversationId: string,
  convoStatus: "CLOSED" | "BOOKED",
) {
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
  // Honor the transition if legal, else force the terminal state (opt-out and
  // bounce are non-negotiable from ANY source state — §9).
  const to = canTransition(lead.status, event) ? transition(lead.status, event) : forced;
  await prisma.lead.update({ where: { id: leadId }, data: { status: to } });
  await prisma.conversation.update({ where: { id: conversationId }, data: { status: convoStatus } });
}

async function suppress(orgId: string, email: string, reason: "BOUNCED" | "OPTED_OUT") {
  await prisma.suppressionEntry.upsert({
    where: { orgId_email: { orgId, email } },
    create: { orgId, email, reason },
    update: { reason },
  });
}

// Extract a bare email address from a possible "Name <email>" header.
function extractAddress(raw: string): string {
  const m = raw.match(/<([^>]+)>/);
  return (m ? m[1] : raw).trim().toLowerCase();
}
