import { prisma } from "@/lib/prisma";
import { generateDraftsForLead, DraftGuardError } from "@/lib/agent/draft";
import { autoApproveAndSend } from "@/lib/agent/autosend";
import { sendAllApproved } from "@/lib/agent/send";
import { resolveLimits } from "@/lib/billing/entitle";

/**
 * Speed-to-Lead — the ≤5-minute new-lead follow-up promised on the Performance
 * and Always-On tiers. A fresh lead should be contacted minutes after it lands,
 * not on the next 4-hour autopilot pass. This is a focused, high-frequency
 * variant of the autopilot draft→send path: it drafts the newest leads
 * immediately and (for auto-send orgs) pushes them out within the SLA.
 *
 * It reuses every rail — the contactability gate inside drafting, and the full
 * send pipeline (warmup ramp, daily/hourly caps, domain auth, circuit breaker).
 * A bulk reactivation import is NOT this job's concern (that's the sweep, paced
 * by warmup); this only touches the recent trickle, bounded per run.
 */

// The SLA the tiers promise. The cron runs well inside it.
export const SPEED_TO_LEAD_SLA_MIN = 5;
// Look back further than the cron interval so a lead is never missed if a run is
// skipped or the lead wasn't yet contactable on an earlier pass.
const WINDOW_MIN = 15;
// Bound work per org per run; the send rails throttle actual sends regardless.
const BATCH = 15;

export interface SpeedToLeadResult {
  orgId: string;
  eligible: boolean;
  drafted: number;
  skipped: number;
  sent: number;
}

/**
 * Eligibility: the org must run auto-drafting AND its tier must include
 * Speed-to-Lead. Unlimited (all-on) when billing isn't configured (dev/CI).
 */
export async function runSpeedToLeadForOrg(orgId: string, now: Date = new Date()): Promise<SpeedToLeadResult> {
  const result: SpeedToLeadResult = { orgId, eligible: false, drafted: 0, skipped: 0, sent: 0 };

  const org = await prisma.org.findUnique({
    where: { id: orgId },
    select: { id: true, name: true, brandName: true, autopilotDraft: true, autopilotApprove: true, autopilotSend: true },
  });
  if (!org || !org.autopilotDraft) return result;

  const limits = await resolveLimits(orgId);
  if (!limits.speedToLead) return result;
  result.eligible = true;

  // Recent, not-yet-drafted NEW leads — oldest-within-window first, so the ones
  // closest to breaching the SLA go out first.
  const since = new Date(now.getTime() - WINDOW_MIN * 60_000);
  const fresh = await prisma.lead.findMany({
    where: { orgId, status: "NEW", createdAt: { gte: since }, drafts: { none: {} } },
    orderBy: { createdAt: "asc" },
    take: BATCH,
    select: { id: true },
  });
  if (fresh.length === 0) return result;

  const operatorName = org.brandName || org.name || "the team";
  for (const lead of fresh) {
    try {
      // Inline (not batched): batching adds hours of latency — the opposite of
      // the promise. The contactability gate inside refuses suppressed/opted-out.
      await generateDraftsForLead({ orgId, leadId: lead.id, operatorName, bulk: true });
      result.drafted += 1;
    } catch (e) {
      if (e instanceof DraftGuardError) result.skipped += 1;
      else throw e;
    }
  }

  // Actually contact them within the SLA when the org runs auto-send. Approval-
  // only orgs get a fast DRAFT (queued); the send waits on the human click.
  if (org.autopilotApprove) {
    const a = await autoApproveAndSend({ orgId });
    result.sent += a.sent;
  }
  if (org.autopilotSend || org.autopilotApprove) {
    const s = await sendAllApproved(orgId);
    result.sent += s.sent;
  }

  return result;
}
