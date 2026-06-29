import { prisma } from "@/lib/prisma";
import { sendApprovedDraft, SendError } from "@/lib/agent/send";

/**
 * Auto-send mode (Org.autopilotApprove). When the operator turns off the
 * approval requirement, the agent auto-approves and sends the drafts it's
 * CONFIDENT about and still routes anything uncertain to the review queue. This
 * is the safety contract that makes "skip approval" responsible:
 *
 *   - only drafts whose best variant clears AUTO_SEND_MIN_CONFIDENCE go out,
 *   - every send still runs the full pipeline (suppression, caps, warmup,
 *     domain auth, circuit breaker) via sendApprovedDraft — nothing here bypasses
 *     a deliverability rail,
 *   - with no connected mailbox we don't touch anything (drafts wait in queue),
 *   - low-confidence drafts are left PENDING_APPROVAL for the human.
 */
export const AUTO_SEND_MIN_CONFIDENCE = 0.72;

export interface AutoSendResult {
  approved: number; // auto-approved (confident enough)
  sent: number; // approved AND delivered through the send pipeline
  heldForReview: number; // left in the queue (below the confidence bar)
}

export async function autoApproveAndSend(opts: { orgId: string; leadIds?: string[] }): Promise<AutoSendResult> {
  const { orgId, leadIds } = opts;
  const result: AutoSendResult = { approved: 0, sent: 0, heldForReview: 0 };

  // No sending identity → leave everything for review rather than approve into a
  // dead end. (Auto-send is meaningless without a mailbox.)
  const mailboxes = await prisma.mailbox.count({ where: { orgId, status: "CONNECTED" } });
  if (mailboxes === 0) return result;

  const drafts = await prisma.draft.findMany({
    where: { orgId, status: "PENDING_APPROVAL", ...(leadIds ? { leadId: { in: leadIds } } : {}) },
    include: { variants: { orderBy: { confidence: "desc" } } },
  });

  for (const draft of drafts) {
    const best = draft.variants[0];
    if (!best || best.confidence < AUTO_SEND_MIN_CONFIDENCE) {
      result.heldForReview += 1;
      continue;
    }

    // Approve (system actor) and queue to send.
    await prisma.$transaction([
      prisma.draft.update({
        where: { id: draft.id },
        data: {
          status: "APPROVED",
          selectedVariantId: best.id,
          finalSubject: best.subject,
          finalBody: best.body,
          editedByHuman: false,
          approvedAt: new Date(),
        },
      }),
      prisma.lead.update({ where: { id: draft.leadId }, data: { status: "SCHEDULED", lastTouchAt: new Date() } }),
      prisma.auditLog.create({
        data: {
          orgId,
          actorId: null, // system — auto-approved by auto-send mode
          action: "draft.autoapprove",
          targetType: "Draft",
          targetId: draft.id,
          metadata: { confidence: best.confidence, variantId: best.id },
        },
      }),
    ]);
    result.approved += 1;

    // Send through the full pipeline. A rail failure (caps/warmup/suppression)
    // is not fatal — the draft stays APPROVED and shows in "ready to send".
    try {
      await sendApprovedDraft({ orgId, draftId: draft.id });
      result.sent += 1;
    } catch (e) {
      if (!(e instanceof SendError)) throw e;
    }
  }

  return result;
}
