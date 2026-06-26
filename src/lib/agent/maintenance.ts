import { prisma } from "@/lib/prisma";
import { transition, canTransition } from "@/lib/agent/state-machine";

/**
 * The follow-up / silence branch of the loop (§3 OBSERVE → §8 timing).
 *
 * A lead that was contacted but never replied shouldn't sit in AWAITING_REPLY
 * forever. This sweep detects leads silent beyond the org's learned
 * `followUpGapDays` and dispatches the COOL event → COOLED, queuing them for
 * re-engagement. The re-touch time (`coolDownUntil`) is set to the next
 * occurrence of the learned `bestSendHour`, so the agent's learned timing
 * actually governs when a cooled lead comes back round — closing that feedback
 * edge. Runs nightly via the jobs cron, or on demand.
 */

// Next occurrence of a given hour-of-day, from `from`. If no hour learned, just
// add the gap. Used to time re-engagement to the highest-reply window.
function nextWindow(from: Date, gapDays: number, bestHour: number | null): Date {
  const d = new Date(from.getTime() + gapDays * 86_400_000);
  if (bestHour !== null) d.setHours(bestHour, 0, 0, 0);
  return d;
}

export interface SweepResult {
  cooled: number;
}

export async function reengagementSweep(orgId: string): Promise<SweepResult> {
  const learning = await prisma.orgLearning.findUnique({ where: { orgId } });
  const gapDays = learning?.followUpGapDays ?? 3;
  const bestHour = learning?.bestSendHour ?? null;

  const cutoff = new Date(Date.now() - gapDays * 86_400_000);

  // Contacted-but-silent leads: sent/awaiting-reply, last touched before the
  // cutoff, with no genuine inbound reply on record.
  const candidates = await prisma.lead.findMany({
    where: {
      orgId,
      status: { in: ["SENT", "AWAITING_REPLY"] },
      lastTouchAt: { lt: cutoff },
      messages: { none: { direction: "INBOUND", isAutoReply: false, isBounce: false } },
    },
    select: { id: true, status: true },
  });

  let cooled = 0;
  for (const lead of candidates) {
    if (!canTransition(lead.status, "COOL")) continue;
    await prisma.$transaction([
      prisma.lead.update({
        where: { id: lead.id },
        data: { status: transition(lead.status, "COOL"), coolDownUntil: nextWindow(new Date(), gapDays, bestHour) },
      }),
      prisma.auditLog.create({
        data: { orgId, action: "lead.cool", targetType: "Lead", targetId: lead.id, metadata: { gapDays, reengageAt: bestHour } },
      }),
    ]);
    cooled += 1;
  }

  return { cooled };
}
