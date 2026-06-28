import { prisma } from "@/lib/prisma";
import { openerStats, hourStats, cohortStats, abLift, type OpenerStat } from "@/lib/agent/rollups";
import type { InsightKind, Prisma } from "@prisma/client";

/**
 * The nightly reflection job (§8). Analyzes recent real outcomes and proposes
 * bounded, metric-justified adjustments — ONLY to copy and timing, never to the
 * sending identity or compliance logic. Each proposal becomes an Insight the
 * operator can apply or veto; nothing changes copy/timing until applied.
 *
 * Proposals are conservative: they require a minimum sample so we don't chase
 * noise, and they're written with the exact metric that justifies them.
 */

const MIN_SENT_FOR_OPENER = 6; // per-opener sample floor
const MIN_SENT_FOR_HOUR = 6;
const MIN_TOTAL_FOR_REFLECTION = 8;

export interface ReflectionResult {
  created: number;
  skipped: string[];
}

interface ProposedInsight {
  kind: InsightKind;
  title: string;
  body: string;
  metric: string;
  payload?: Prisma.InputJsonValue;
}

export async function runReflection(orgId: string): Promise<ReflectionResult> {
  const [openers, hours, cohorts] = await Promise.all([openerStats(orgId), hourStats(orgId), cohortStats(orgId)]);
  const totalSent = openers.reduce((n, o) => n + o.sent, 0);

  const skipped: string[] = [];
  if (totalSent < MIN_TOTAL_FOR_REFLECTION) {
    await touchReflection(orgId);
    return { created: 0, skipped: [`Only ${totalSent} sends so far — need ${MIN_TOTAL_FOR_REFLECTION} before reflecting.`] };
  }

  const proposals: ProposedInsight[] = [];

  // 1. Promote the best opener — ranked by CONVERSION, not just replies. A booked
  //    call is the goal (the 30%-recovery target), so weight bookings heavily
  //    above replies; replies break ties before any calls have landed.
  const bookRate = (o: OpenerStat) => (o.sent ? o.booked / o.sent : 0);
  const conversionScore = (o: OpenerStat) => bookRate(o) * 3 + o.replyRate;
  const rankedOpeners = openers
    .filter((o) => o.sent >= MIN_SENT_FOR_OPENER)
    .sort((a, b) => conversionScore(b) - conversionScore(a));
  if (rankedOpeners.length >= 2) {
    const best = rankedOpeners[0];
    const worst = rankedOpeners[rankedOpeners.length - 1];
    if (conversionScore(best) > conversionScore(worst) && (best.replyRate > 0 || best.booked > 0)) {
      proposals.push({
        kind: "PROMOTE_OPENER",
        title: best.booked > 0 ? "Lead with the opener that books calls" : "Lead with the opener that's landing",
        body:
          best.booked > 0
            ? `Messages opening with “${best.opener}…” are booking the most calls. I'll favor that opening line.`
            : `Messages opening with “${best.opener}…” are getting more replies than the rest. I'll favor that opening line.`,
        metric:
          best.booked > 0
            ? `${(bookRate(best) * 100).toFixed(0)}% booked + ${(best.replyRate * 100).toFixed(0)}% reply over ${best.sent} sends`
            : `${(best.replyRate * 100).toFixed(0)}% reply rate vs ${(worst.replyRate * 100).toFixed(0)}%`,
        payload: { promoteOpener: best.opener },
      });
    }

    // 2. Retire the weakest opener if it's meaningfully behind.
    if (worst.replyRate * 1.5 < best.replyRate && worst.sent >= MIN_SENT_FOR_OPENER) {
      proposals.push({
        kind: "RETIRE_PHRASE",
        title: "Retire an opener that isn't working",
        body: `“${worst.opener}…” is under-performing. I'll stop opening with it.`,
        metric: `only ${(worst.replyRate * 100).toFixed(0)}% reply rate over ${worst.sent} sends`,
        payload: { retirePhrase: worst.opener },
      });
    }
  }

  // 3. Shift to the highest-reply send hour.
  const rankedHours = hours.filter((h) => h.sent >= MIN_SENT_FOR_HOUR).sort((a, b) => b.replyRate - a.replyRate);
  if (rankedHours.length >= 1 && rankedHours[0].replyRate > 0) {
    const bestHour = rankedHours[0];
    proposals.push({
      kind: "SHIFT_SENDTIME",
      title: `Shift more sends to ${formatHour(bestHour.hour)}`,
      body: `Your audience replies most to messages sent around ${formatHour(bestHour.hour)}. I'll weight sends toward that window.`,
      metric: `${(bestHour.replyRate * 100).toFixed(0)}% reply rate at ${formatHour(bestHour.hour)}`,
      payload: { bestSendHour: bestHour.hour },
    });
  }

  // 4. A/B readout — always informational, never auto-applied.
  const lift = abLift(cohorts);
  if (lift.liftPct !== null && lift.treatment && lift.holdout && lift.holdout.contacted >= 3) {
    proposals.push({
      kind: "AB_RESULT",
      title: lift.liftPct >= 0 ? "The optimized copy is winning" : "Holdout is ahead — staying cautious",
      body: `Treatment (agent-optimized) replied ${(lift.treatment.replyRate * 100).toFixed(0)}% and booked ${(lift.treatment.bookRate * 100).toFixed(0)}% vs the holdout control at ${(lift.holdout.replyRate * 100).toFixed(0)}% reply / ${(lift.holdout.bookRate * 100).toFixed(0)}% booked. Measured against a real control, not assumed.`,
      metric: `${lift.liftPct >= 0 ? "+" : ""}${lift.liftPct.toFixed(0)}% lift (n=${lift.treatment.contacted}/${lift.holdout.contacted})`,
    });
  }

  // De-dupe against still-pending proposals of the same kind+metric.
  const pending = await prisma.insight.findMany({ where: { orgId, status: "PROPOSED" }, select: { kind: true, metric: true } });
  const pendingKey = new Set(pending.map((p) => `${p.kind}:${p.metric}`));
  const fresh = proposals.filter((p) => !pendingKey.has(`${p.kind}:${p.metric}`));

  if (fresh.length > 0) {
    await prisma.insight.createMany({
      data: fresh.map((p) => ({ orgId, kind: p.kind, title: p.title, body: p.body, metric: p.metric, payload: p.payload })),
    });
  }
  await touchReflection(orgId);

  return { created: fresh.length, skipped };
}

async function touchReflection(orgId: string) {
  await prisma.orgLearning.upsert({
    where: { orgId },
    create: { orgId, lastReflectionAt: new Date() },
    update: { lastReflectionAt: new Date() },
  });
}

function formatHour(h: number): string {
  const ampm = h < 12 ? "am" : "pm";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}${ampm}`;
}

/**
 * Apply an insight into OrgLearning (the only place tuned settings live). Returns
 * false for AB_RESULT (informational). Bumps the learning version ("v14").
 */
export async function applyInsight(orgId: string, insightId: string, userId: string): Promise<boolean> {
  const insight = await prisma.insight.findFirst({ where: { id: insightId, orgId, status: "PROPOSED" } });
  if (!insight) return false;
  if (insight.kind === "AB_RESULT") {
    await prisma.insight.update({ where: { id: insight.id }, data: { status: "APPLIED", appliedAt: new Date(), appliedById: userId } });
    return true;
  }

  const payload = (insight.payload ?? {}) as { bestSendHour?: number; retirePhrase?: string; promoteOpener?: string; followUpGapDays?: number };
  const learning = await prisma.orgLearning.findUnique({ where: { orgId } });
  const retired = new Set(learning?.retiredPhrases ?? []);
  const promoted = new Set(learning?.promotedOpeners ?? []);
  if (payload.retirePhrase) retired.add(payload.retirePhrase);
  if (payload.promoteOpener) promoted.add(payload.promoteOpener);

  await prisma.$transaction([
    prisma.orgLearning.upsert({
      where: { orgId },
      create: {
        orgId,
        bestSendHour: payload.bestSendHour ?? null,
        retiredPhrases: [...retired],
        promotedOpeners: [...promoted],
        followUpGapDays: payload.followUpGapDays ?? 3,
        version: 2,
      },
      update: {
        bestSendHour: payload.bestSendHour ?? learning?.bestSendHour ?? null,
        retiredPhrases: [...retired],
        promotedOpeners: [...promoted],
        followUpGapDays: payload.followUpGapDays ?? learning?.followUpGapDays ?? 3,
        version: { increment: 1 },
      },
    }),
    prisma.insight.update({ where: { id: insight.id }, data: { status: "APPLIED", appliedAt: new Date(), appliedById: userId } }),
  ]);
  return true;
}

export async function vetoInsight(orgId: string, insightId: string): Promise<boolean> {
  const res = await prisma.insight.updateMany({ where: { id: insightId, orgId, status: "PROPOSED" }, data: { status: "VETOED" } });
  return res.count > 0;
}
