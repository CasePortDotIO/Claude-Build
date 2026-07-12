import { prisma, withDbRetry } from "@/lib/prisma";
import { generateDraftsForLead, DraftGuardError } from "@/lib/agent/draft";
import { transition } from "@/lib/agent/state-machine";
import { resolveLimits } from "@/lib/billing/entitle";
import { gapDaysFor, BASELINE_GAP_DAYS } from "@/lib/agent/experiments";
import { assignCohort } from "@/lib/agent/rollups";

/**
 * Multi-touch follow-up engine. Most reactivations don't happen on the first
 * email — they land on touch 2–3. A lead that was sent and went quiet sits in
 * AWAITING_REPLY; once the configured gap has elapsed this drafts the next touch
 * (queued for approval, never auto-sent), with a fresh angle each time and a
 * graceful "breakup" on the final touch. After the touches are exhausted the
 * lead is closed (CLOSED_LOST) so the funnel never loops forever.
 *
 * Rails preserved: drafting runs the SAME contactability gate
 * (suppression / opt-out / DNC / terminal) as every other send path, the gap is
 * honoured, and nothing is sent here — only queued for the operator.
 */

const DAY_MS = 86_400_000;

// touch 1 is the initial email; we add up to (MAX_TOUCHES - 1) follow-ups, the
// last of which is the breakup. So 4 = first send + 3 follow-ups.
export const MAX_TOUCHES = 4;

export interface FollowupRunResult {
  generated: number; // follow-up drafts queued for approval
  closed: number; // leads closed after exhausting their touches
  skipped: number; // not due yet / already has a pending draft / guard refused
}

export async function runFollowupsForOrg(orgId: string, now: Date = new Date()): Promise<FollowupRunResult> {
  const result: FollowupRunResult = { generated: 0, closed: 0, skipped: 0 };

  const org = await prisma.org.findUnique({ where: { id: orgId }, select: { name: true, brandName: true } });
  if (!org) return result;
  const operatorName = org.brandName || org.name || "the team";

  // Sequence depth is a tier entitlement: single-pass tiers (maxTouches = 1) get
  // no follow-ups; multi-touch tiers get up to (maxTouches - 1). Falls back to
  // the default depth when billing isn't configured (dev/CI).
  const maxTouches = (await resolveLimits(orgId)).maxTouches || MAX_TOUCHES;

  // Candidates: contacted, waiting, no genuine reply yet.
  const leads = await prisma.lead.findMany({
    where: { orgId, status: "AWAITING_REPLY" },
    orderBy: { lastTouchAt: "asc" },
    take: 200,
    select: { id: true, status: true },
  });

  for (const lead of leads) {
    // Outbound history = touch count; the most recent send drives the gap.
    const outbound = await prisma.message.findMany({
      where: { orgId, leadId: lead.id, direction: "OUTBOUND" },
      orderBy: { createdAt: "desc" },
      select: { sentAt: true, createdAt: true, subject: true },
    });
    if (outbound.length === 0) {
      result.skipped += 1;
      continue;
    }

    const touches = outbound.length;
    const lastSentAt = outbound[0].sentAt ?? outbound[0].createdAt;
    // Follow-up gap is the randomized experiment arm (2d vs 4d) for TREATMENT
    // leads; the HOLDOUT control gets the fixed baseline so lift is measured
    // against a real counterfactual. Logged on outcomes → cadence effect is causal.
    const holdout = assignCohort(orgId, lead.id) === "HOLDOUT";
    const gapMs = (holdout ? BASELINE_GAP_DAYS : gapDaysFor(lead.id)) * DAY_MS;
    if (now.getTime() - lastSentAt.getTime() < gapMs) {
      result.skipped += 1; // not due yet
      continue;
    }

    // Touches exhausted (the breakup already went out): close the file gracefully.
    if (touches >= maxTouches) {
      try {
        await prisma.lead.update({ where: { id: lead.id }, data: { status: transition(lead.status, "CLOSE_LOST") } });
        result.closed += 1;
      } catch {
        result.skipped += 1;
      }
      continue;
    }

    // Never stack drafts on a lead that already has one waiting.
    if ((await prisma.draft.count({ where: { orgId, leadId: lead.id, status: "PENDING_APPROVAL" } })) > 0) {
      result.skipped += 1;
      continue;
    }

    const touch = touches + 1;
    try {
      await withDbRetry(() =>
        generateDraftsForLead({
          orgId,
          leadId: lead.id,
          operatorName,
          followUp: { touch, isFinal: touch >= maxTouches, previousSubject: outbound[0].subject ?? null },
          bulk: true,
        }),
      );
      result.generated += 1;
    } catch (e) {
      if (e instanceof DraftGuardError) result.skipped += 1;
      else throw e;
    }
  }

  return result;
}
