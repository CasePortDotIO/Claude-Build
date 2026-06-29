import { prisma } from "@/lib/prisma";
import { classifyInbound, type InboundEmail } from "@/lib/mailbox/types";
import { getLLMProvider } from "@/lib/ai/provider";
import { estimateCostUsd } from "@/lib/ai/config";
import { defaultVoiceProfile } from "@/lib/agent/voice";
import { buildOptOutLine } from "@/lib/agent/draft";
import { transition, canTransition } from "@/lib/agent/state-machine";
import { availabilityLabels } from "@/lib/agent/booking";
import { storeMemory } from "@/lib/memory";
import { autoPauseDecision } from "@/lib/compliance/caps";
import { classifyReplyIntent } from "@/lib/agent/reply-intent";
import { recordOutcome } from "@/lib/outcomes";
import { notifyReply } from "@/lib/notify";
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

  // ── Bounce: hard stop + suppress + deliverability accounting ──
  if (flags.isBounce) {
    await applyTerminal(lead.id, "BOUNCE", "BOUNCED", conversation.id, "CLOSED");
    await suppress(orgId, lead.email, "BOUNCED");
    await recordBounceAndMaybePause(mailboxId);
    return { outcome: "bounce", leadId: lead.id, conversationId: conversation.id };
  }

  // ── Opt-out: honor instantly + permanently (a "stop" reply is also a complaint) ──
  if (flags.isOptOut) {
    await applyTerminal(lead.id, "OPT_OUT", "OPTED_OUT", conversation.id, "CLOSED");
    await suppress(orgId, lead.email, "OPTED_OUT");
    await recordComplaintAndMaybePause(mailboxId);
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
  // §10: a genuine reply is a conversion signal.
  await recordOutcome({ orgId, leadId: lead.id, kind: "REPLIED" });

  // §5 confidence gate: read the reply's intent before drafting. Off-script,
  // ambiguous, hostile, or unverifiable → hold with a safe reply + flag why.
  const assessment = classifyReplyIntent(email.body);
  const replyDraftId = await draftReplyForApproval({
    orgId,
    leadId: lead.id,
    conversationId: conversation.id,
    theirReply: email.body,
    holdForReview: assessment.needsHuman,
  });

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastInboundAt: email.receivedAt, status: "NEEDS_REVIEW", reviewReason: assessment.needsHuman ? assessment.reason : null },
  });

  // Real-time alert: the "someone replied" moment is the week-one win — push it
  // now rather than burying it in the daily brief. Best-effort, post-commit, so a
  // dead webhook can never break reply ingestion.
  const leadName = [lead.firstName, lead.lastName].filter(Boolean).join(" ") || lead.email;
  try {
    await notifyReply({ orgId, leadName, snippet: email.body, needsReview: assessment.needsHuman });
  } catch {
    /* best-effort notification */
  }

  return { outcome: "reply", leadId: lead.id, conversationId: conversation.id, replyDraftId };
}

/** Draft a reply to a lead's message and queue it for approval (NEGOTIATING). */
async function draftReplyForApproval(opts: {
  orgId: string;
  leadId: string;
  conversationId: string;
  theirReply: string;
  holdForReview?: boolean;
}): Promise<string> {
  const start = Date.now();
  const { orgId, leadId, conversationId, theirReply, holdForReview } = opts;

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

  const provider = await getLLMProvider();
  const result = await provider.draftReply({
    lead: { firstName: lead.firstName, company: lead.company, originalInquiry: lead.originalInquiry, statedGoal: lead.statedGoal, toneRead: lead.toneRead, objections: lead.objections ?? [] },
    voice,
    operatorName: org.brandName || org.name,
    optOutLine: buildOptOutLine(),
    thread,
    theirReply,
    availability, // real calendar slots from the connected calendar (M4)
    variantCount: holdForReview ? 1 : 2,
    holdForReview,
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

// Deliverability accounting: increment the counter, then auto-pause the mailbox
// if its bounce/complaint rate crosses the threshold (§9). Protects sender rep.
async function recordBounceAndMaybePause(mailboxId: string) {
  const mb = await prisma.mailbox.update({ where: { id: mailboxId }, data: { bounceCount: { increment: 1 } } });
  const decision = autoPauseDecision(mb);
  if (decision.pause && mb.status === "CONNECTED") {
    // §4 circuit breaker: pause AND require a list re-scrub before resuming, so a
    // naive un-pause can't keep burning the domain on the same dirty list.
    await prisma.mailbox.update({ where: { id: mailboxId }, data: { status: "PAUSED", pausedReason: decision.reason, requiresRescrub: true } });
    await prisma.auditLog.create({ data: { orgId: mb.orgId, action: "mailbox.autopause", targetType: "Mailbox", targetId: mailboxId, metadata: { reason: decision.reason } } });
  }
}

async function recordComplaintAndMaybePause(mailboxId: string) {
  const mb = await prisma.mailbox.update({ where: { id: mailboxId }, data: { complaintCount: { increment: 1 } } });
  const decision = autoPauseDecision(mb);
  if (decision.pause && mb.status === "CONNECTED") {
    // §4 circuit breaker: pause AND require a list re-scrub before resuming, so a
    // naive un-pause can't keep burning the domain on the same dirty list.
    await prisma.mailbox.update({ where: { id: mailboxId }, data: { status: "PAUSED", pausedReason: decision.reason, requiresRescrub: true } });
    await prisma.auditLog.create({ data: { orgId: mb.orgId, action: "mailbox.autopause", targetType: "Mailbox", targetId: mailboxId, metadata: { reason: decision.reason } } });
  }
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
