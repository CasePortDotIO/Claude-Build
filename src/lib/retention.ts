import { prisma } from "@/lib/prisma";
import { cohortStats, abLift } from "@/lib/agent/rollups";

/**
 * Retention engine (M10). The moat for this product is an agent that compounds
 * value the operator can SEE and would lose by leaving — their voice, the
 * learned timing, the lead memory, a warmed sender reputation, and a growing
 * ROI ledger. These reads turn that invisible plumbing into felt equity:
 *
 *  - agentMaturity  — switching cost made legible (a score that climbs with use)
 *  - roiLedger      — cumulative recovered revenue (loss aversion on churn)
 *  - dailyBrief     — the habit loop's variable reward (what happened overnight)
 *
 * All pure, org-scoped reads. No new schema — every input already accrues.
 */

const DAY_MS = 86_400_000;

// ── Agent maturity: the switching-cost score ────────────────────────────────
export interface MaturityComponent {
  label: string;
  detail: string;
  points: number;
  max: number;
}
export interface AgentMaturity {
  score: number; // 0..100
  tier: string;
  components: MaturityComponent[];
  warmedDays: number;
  voiceSamples: number;
  insightsApplied: number;
  leadsRemembered: number;
  liftPct: number | null;
  selfUpdates: number;
}

function tierFor(score: number): string {
  if (score >= 80) return "Elite";
  if (score >= 55) return "Seasoned";
  if (score >= 30) return "Trained";
  return "Newly hired";
}

export async function agentMaturity(orgId: string): Promise<AgentMaturity> {
  const [voiceSamples, leadsRemembered, insightsApplied, learning, oldestMailbox, cohorts] = await Promise.all([
    prisma.voiceSample.count({ where: { orgId } }),
    prisma.lead.count({ where: { orgId } }),
    prisma.insight.count({ where: { orgId, status: "APPLIED" } }),
    prisma.orgLearning.findUnique({ where: { orgId } }),
    prisma.mailbox.findFirst({
      where: { orgId, status: "CONNECTED" },
      orderBy: { createdAt: "asc" },
      select: { warmupStartedAt: true, createdAt: true },
    }),
    cohortStats(orgId),
  ]);

  const lift = abLift(cohorts);
  const liftPct = lift.treatment && lift.holdout ? Math.round(lift.liftPct ?? 0) : null;

  const warmStart = oldestMailbox?.warmupStartedAt ?? oldestMailbox?.createdAt ?? null;
  const warmedDays = warmStart ? Math.max(0, Math.floor((Date.now() - warmStart.getTime()) / DAY_MS)) : 0;

  // Each component caps so the score is bounded and every lever is reachable.
  const voicePts = Math.min(25, voiceSamples * 5); // ~5 samples = fully trained voice
  const memoryPts = Math.min(20, Math.floor(leadsRemembered / 5)); // 100 leads = full
  const improvePts = Math.min(20, insightsApplied * 4 + Math.max(0, (learning?.version ?? 1) - 1) * 2);
  const warmPts = Math.min(20, Math.round((warmedDays / 45) * 20)); // ~45 days = fully warmed
  const liftPts = liftPct && liftPct > 0 ? Math.min(15, Math.round(liftPct / 2)) : 0;

  const score = Math.round(voicePts + memoryPts + improvePts + warmPts + liftPts);

  const components: MaturityComponent[] = [
    { label: "Voice trained", detail: `${voiceSamples} of your emails learned`, points: voicePts, max: 25 },
    { label: "Lead memory", detail: `${leadsRemembered.toLocaleString("en-US")} contacts remembered`, points: memoryPts, max: 20 },
    { label: "Self-improvement", detail: `${insightsApplied} insight${insightsApplied === 1 ? "" : "s"} applied · v${learning?.version ?? 1}`, points: improvePts, max: 20 },
    { label: "Sender reputation", detail: warmedDays > 0 ? `${warmedDays} days warmed` : "connect a mailbox to start", points: warmPts, max: 20 },
    { label: "Measured lift", detail: liftPct != null ? `+${Math.round(liftPct)}% vs. holdout control` : "needs an A/B holdout to measure", points: liftPts, max: 15 },
  ];

  return {
    score,
    tier: tierFor(score),
    components,
    warmedDays,
    voiceSamples,
    insightsApplied,
    leadsRemembered,
    liftPct,
    selfUpdates: learning?.version ?? 1,
  };
}

// ── ROI ledger: the number that only grows ──────────────────────────────────
export interface RoiLedger {
  recoveredCents: number;
  callsBooked: number;
  leadsReactivated: number;
  daysActive: number;
  perMonthCents: number; // run-rate: recovered / months active
}

export async function roiLedger(orgId: string): Promise<RoiLedger> {
  const [revenue, callsBooked, reactivated, org] = await Promise.all([
    prisma.booking.aggregate({ where: { orgId, status: { in: ["CONFIRMED", "NO_SHOW"] } }, _sum: { valueCents: true } }),
    prisma.booking.count({ where: { orgId, status: { in: ["CONFIRMED", "NO_SHOW"] } } }),
    // A lead is "reactivated" once it replies for real (the agent woke it up).
    prisma.message.findMany({
      where: { orgId, direction: "INBOUND", isAutoReply: false, isBounce: false },
      distinct: ["leadId"],
      select: { leadId: true },
    }),
    prisma.org.findUnique({ where: { id: orgId }, select: { createdAt: true } }),
  ]);

  const recoveredCents = revenue._sum.valueCents ?? 0;
  const daysActive = org ? Math.max(1, Math.floor((Date.now() - org.createdAt.getTime()) / DAY_MS)) : 1;
  const monthsActive = Math.max(1, daysActive / 30);
  return {
    recoveredCents,
    callsBooked,
    leadsReactivated: reactivated.length,
    daysActive,
    perMonthCents: Math.round(recoveredCents / monthsActive),
  };
}

// ── Daily brief: the habit loop's variable reward ───────────────────────────
export interface DailyBrief {
  drafted: number;
  replied: number;
  booked: number;
  recoveredCents: number; // value booked in the window
  pendingApprovals: number;
  latestInsight: { title: string; body: string } | null;
  cumulativeRecoveredCents: number;
  hasActivity: boolean;
  windowHours: number;
}

export async function dailyBrief(orgId: string, windowHours = 24): Promise<DailyBrief> {
  const since = new Date(Date.now() - windowHours * 3600 * 1000);

  const [drafted, replied, bookings, pendingApprovals, latestInsight, cumulative] = await Promise.all([
    prisma.agentRun.count({ where: { orgId, step: "DRAFT", createdAt: { gte: since } } }),
    prisma.message.count({ where: { orgId, direction: "INBOUND", isAutoReply: false, isBounce: false, createdAt: { gte: since } } }),
    prisma.booking.findMany({ where: { orgId, status: { in: ["CONFIRMED", "NO_SHOW"] }, createdAt: { gte: since } }, select: { valueCents: true } }),
    prisma.draft.count({ where: { orgId, status: "PENDING_APPROVAL" } }),
    prisma.insight.findFirst({ where: { orgId, status: "APPLIED" }, orderBy: { appliedAt: "desc" }, select: { title: true, body: true } }),
    prisma.booking.aggregate({ where: { orgId, status: { in: ["CONFIRMED", "NO_SHOW"] } }, _sum: { valueCents: true } }),
  ]);

  const booked = bookings.length;
  const recoveredCents = bookings.reduce((n, b) => n + b.valueCents, 0);
  return {
    drafted,
    replied,
    booked,
    recoveredCents,
    pendingApprovals,
    latestInsight: latestInsight ? { title: latestInsight.title, body: latestInsight.body } : null,
    cumulativeRecoveredCents: cumulative._sum.valueCents ?? 0,
    hasActivity: drafted + replied + booked + pendingApprovals > 0,
    windowHours,
  };
}
