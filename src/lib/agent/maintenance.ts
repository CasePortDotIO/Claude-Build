import { prisma } from "@/lib/prisma";
import { transition, canTransition } from "@/lib/agent/state-machine";
import { getEmailVerifier } from "@/lib/verify";

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

/**
 * §3: re-verify contacts that have sat unsent for more than 30 days — data
 * decays (domains lapse, mailboxes get deactivated), and a verdict from import
 * time can go stale before the lead is ever worked. Re-runs the verifier on
 * still-unsent leads whose last check is older than the window; if an address
 * has gone INVALID, it's hard-suppressed and removed from the sendable pool.
 */
export interface ReverifyResult {
  rechecked: number;
  newlyInvalid: number;
}

export async function reverifyStale(orgId: string, olderThanDays = 30): Promise<ReverifyResult> {
  const cutoff = new Date(Date.now() - olderThanDays * 86_400_000);
  const stale = await prisma.lead.findMany({
    where: {
      orgId,
      status: { in: ["NEW", "RESEARCHED"] }, // unsent only
      OR: [{ verifiedAt: { lt: cutoff } }, { verifiedAt: null }],
    },
    select: { id: true, email: true },
    take: 500,
  });
  if (stale.length === 0) return { rechecked: 0, newlyInvalid: 0 };

  const verdicts = await getEmailVerifier().verify(stale.map((l) => l.email));
  const byEmail = new Map(verdicts.map((v) => [v.email.toLowerCase(), v]));
  const now = new Date();

  let newlyInvalid = 0;
  for (const lead of stale) {
    const v = byEmail.get(lead.email.toLowerCase());
    if (!v) continue;
    await prisma.lead.update({
      where: { id: lead.id },
      data: { reachability: v.status, verifiedAt: now, verifyReason: v.reason },
    });
    if (v.status === "INVALID") {
      // Pull it out of the sendable pool and remember it.
      await prisma.$transaction([
        prisma.lead.update({ where: { id: lead.id }, data: { status: "DO_NOT_CONTACT" } }),
        prisma.suppressionEntry.upsert({
          where: { orgId_email: { orgId, email: lead.email.toLowerCase() } },
          create: { orgId, email: lead.email.toLowerCase(), reason: "INVALID", note: v.reason },
          update: { reason: "INVALID", note: v.reason },
        }),
      ]);
      newlyInvalid += 1;
    }
  }
  return { rechecked: stale.length, newlyInvalid };
}
