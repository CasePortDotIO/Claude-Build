import { prisma } from "@/lib/prisma";
import { QUALIFIED_BOOKING_STATUSES } from "@/lib/booking-status";
import { resolveTier, type PlanTier } from "@/lib/billing/entitlements";
import { createNotification } from "@/lib/notifications";
import type { GuaranteeType, RemedyKind } from "@prisma/client";

/**
 * The guarantee engine (§8). The performance promises — "≥3 booked calls in 30
 * days or keep sweeping free", "fewer than 5 booked calls this month → month
 * free", the Always-On Triple-Lock — are a real subsystem, not marketing copy:
 * each is a rolling GuaranteeLedger window that counts QUALIFIED booked calls
 * (the ONE definition in booking-status.ts, shared with the trial conversion)
 * and settles to MET or MISSED, applying the tier's remedy on a miss.
 *
 * Money-back remedies are never fired autonomously: a missed monthly guarantee
 * credits a free month (recorded on the org for the billing path to honor) and a
 * repeated one-shot miss records a REFUND_DUE obligation — both surfaced to the
 * operator. The engine keeps the agent running free; it never issues a refund on
 * its own.
 */

const DAY_MS = 86_400_000;

// Legacy default retained for orgs with no active ledger (and no tier guarantee).
export const GUARANTEE_CALLS_DEFAULT = 10;
export const GUARANTEE_WINDOW_DAYS = 30;

export interface GuaranteePolicy {
  type: GuaranteeType;
  threshold: number; // qualified booked calls required
  windowDays: number;
  recurring: boolean; // reopen a fresh window after each settlement
}

/**
 * The guarantee a tier carries (null → no booked-call guarantee). Founding/Own-It
 * promise 3-in-30; Continuity carries the Triple-Lock's monthly 5-calls-or-free.
 */
export function guaranteeForTier(tier: PlanTier): GuaranteePolicy | null {
  switch (tier) {
    case "FRONT_END":
    case "OTO1":
      return { type: "THREE_CALL", threshold: 3, windowDays: 30, recurring: false };
    case "CONTINUITY":
      return { type: "FIVE_CALL_MONTH", threshold: 5, windowDays: 30, recurring: true };
    default:
      return null; // PERFORMANCE is pay-per-result (billing, not a call guarantee)
  }
}

/** Count qualified booked calls for an org within [since, until]. */
export function qualifiedBookingCount(orgId: string, since: Date, until: Date): Promise<number> {
  return prisma.booking.count({
    where: { orgId, status: { in: QUALIFIED_BOOKING_STATUSES }, createdAt: { gte: since, lte: until } },
  });
}

export interface GuaranteeStatus {
  threshold: number; // X
  booked: number; // qualified booked calls in the window
  windowDays: number;
  met: boolean;
  remaining: number; // calls still needed (0 once met)
  progressPct: number; // 0..100 for the bar
  windowStart: Date;
}

/** The effective X for an org: its override, else the single default. */
export function guaranteeThreshold(org: { guaranteeCalls: number | null } | null): number {
  return org?.guaranteeCalls ?? GUARANTEE_CALLS_DEFAULT;
}

/**
 * Dashboard status. When the org has an ACTIVE ledger window (a live customer on
 * a guaranteed tier) it reflects that window's threshold + progress; otherwise it
 * falls back to the legacy rolling-30-day view so pre-ledger orgs still render.
 */
export async function guaranteeStatus(orgId: string, now: Date = new Date()): Promise<GuaranteeStatus> {
  const ledger = await prisma.guaranteeLedger.findFirst({
    where: { orgId, status: "ACTIVE" },
    orderBy: { periodStart: "desc" },
  });

  if (ledger) {
    const booked = await qualifiedBookingCount(orgId, ledger.periodStart, now);
    const windowDays = Math.max(1, Math.round((ledger.periodEnd.getTime() - ledger.periodStart.getTime()) / DAY_MS));
    return {
      threshold: ledger.threshold,
      booked,
      windowDays,
      met: booked >= ledger.threshold,
      remaining: Math.max(0, ledger.threshold - booked),
      progressPct: ledger.threshold > 0 ? Math.min(100, Math.round((booked / ledger.threshold) * 100)) : 100,
      windowStart: ledger.periodStart,
    };
  }

  // Legacy fallback: rolling 30-day window against the override/default threshold.
  const windowStart = new Date(now.getTime() - GUARANTEE_WINDOW_DAYS * DAY_MS);
  const [org, booked] = await Promise.all([
    prisma.org.findUnique({ where: { id: orgId }, select: { guaranteeCalls: true } }),
    qualifiedBookingCount(orgId, windowStart, now),
  ]);
  const threshold = guaranteeThreshold(org);
  return {
    threshold,
    booked,
    windowDays: GUARANTEE_WINDOW_DAYS,
    met: booked >= threshold,
    remaining: Math.max(0, threshold - booked),
    progressPct: threshold > 0 ? Math.min(100, Math.round((booked / threshold) * 100)) : 100,
    windowStart,
  };
}

/**
 * Open a guarantee window for a paying org on a guaranteed tier, if one isn't
 * already open. Idempotent — safe to call from the webhook (on activation) and
 * from the daily evaluator (to backfill existing subscribers).
 */
export async function ensureGuaranteeWindow(orgId: string, now: Date = new Date()): Promise<void> {
  const org = await prisma.org.findUnique({ where: { id: orgId }, select: { planTier: true, billingStatus: true } });
  // The booked-call guarantee applies once they're a paying customer; the $0
  // trial itself is Triple-Lock leg 1 (no pay until 3 calls), handled elsewhere.
  if (!org || org.billingStatus !== "active") return;
  const policy = guaranteeForTier(resolveTier(org));
  if (!policy) return;

  const existing = await prisma.guaranteeLedger.findFirst({ where: { orgId, status: "ACTIVE" }, select: { id: true } });
  if (existing) return;

  await prisma.guaranteeLedger.create({
    data: {
      orgId,
      type: policy.type,
      threshold: policy.threshold,
      periodStart: now,
      periodEnd: new Date(now.getTime() + policy.windowDays * DAY_MS),
    },
  });
}

export interface EvaluateResult {
  opened: number; // fresh windows opened (backfill + recurrence)
  met: number;
  missed: number;
}

/**
 * Settle every ACTIVE window whose period has closed, and backfill windows for
 * paying orgs that don't have one yet. Runs on the daily cron. Best-effort per
 * org — one failure never aborts the batch.
 */
export async function evaluateGuarantees(now: Date = new Date()): Promise<EvaluateResult> {
  const result: EvaluateResult = { opened: 0, met: 0, missed: 0 };

  // (1) Backfill: paying orgs on a guaranteed tier with no open window.
  const active = await prisma.org.findMany({
    where: { billingStatus: "active", guaranteeLedgers: { none: { status: "ACTIVE" } } },
    select: { id: true },
  });
  for (const o of active) {
    try {
      const before = await prisma.guaranteeLedger.count({ where: { orgId: o.id, status: "ACTIVE" } });
      await ensureGuaranteeWindow(o.id, now);
      if ((await prisma.guaranteeLedger.count({ where: { orgId: o.id, status: "ACTIVE" } })) > before) result.opened += 1;
    } catch {
      /* skip this org */
    }
  }

  // (2) Settle due windows.
  const due = await prisma.guaranteeLedger.findMany({
    where: { status: "ACTIVE", periodEnd: { lte: now } },
    orderBy: { periodEnd: "asc" },
    take: 500,
  });
  for (const window of due) {
    try {
      const settled = await settleWindow(window, now);
      if (settled === "MET") result.met += 1;
      else result.missed += 1;
      // The monthly guarantee is recurring — reopen the next window so it keeps
      // settling every month. The one-shot THREE_CALL settles once (its remedy is
      // recorded + surfaced); its free-extension reopens with the one-time flow.
      if (window.type === "FIVE_CALL_MONTH") {
        await ensureGuaranteeWindow(window.orgId, now);
        result.opened += 1;
      }
    } catch {
      /* skip this window */
    }
  }

  return result;
}

async function settleWindow(
  window: { id: string; orgId: string; type: GuaranteeType; threshold: number; periodStart: Date; periodEnd: Date },
  now: Date,
): Promise<"MET" | "MISSED"> {
  const booked = await qualifiedBookingCount(window.orgId, window.periodStart, window.periodEnd);
  if (booked >= window.threshold) {
    await prisma.guaranteeLedger.update({
      where: { id: window.id },
      data: { status: "MET", bookedCount: booked, settledAt: now },
    });
    await createNotification({
      orgId: window.orgId,
      kind: "GUARANTEE_MET",
      title: "Guarantee met — the agent delivered",
      body: `${booked} booked calls this period (goal ${window.threshold}).`,
      actionUrl: "/",
    });
    return "MET";
  }

  // Missed → apply the tier's remedy.
  const remedy = await remedyForMiss(window);
  await prisma.guaranteeLedger.update({
    where: { id: window.id },
    data: { status: "MISSED", bookedCount: booked, settledAt: now, remedy },
  });
  await createNotification({
    orgId: window.orgId,
    kind: "GUARANTEE_MISSED",
    title: remedyHeadline(remedy),
    body: `Only ${booked} of ${window.threshold} booked calls this period — ${remedyDetail(remedy)}`,
    actionUrl: "/",
  });
  return "MISSED";
}

/**
 * Decide + apply the remedy for a missed window. Recurring miss → free month
 * (credited on the org for the billing path to honor). First one-shot miss → free
 * extension (the next window reopens automatically). Repeat one-shot miss →
 * REFUND_DUE, recorded for an operator to approve (never auto-refunded).
 */
async function remedyForMiss(window: { orgId: string; type: GuaranteeType }): Promise<RemedyKind> {
  if (window.type === "FIVE_CALL_MONTH") {
    await prisma.org.update({ where: { id: window.orgId }, data: { guaranteeCreditMonths: { increment: 1 } } });
    return "FREE_MONTH";
  }
  // THREE_CALL: a prior miss means the free extension already ran → refund is due.
  const priorMiss = await prisma.guaranteeLedger.count({
    where: { orgId: window.orgId, type: "THREE_CALL", status: "MISSED" },
  });
  return priorMiss > 0 ? "REFUND_DUE" : "FREE_EXTENSION";
}

function remedyHeadline(remedy: RemedyKind): string {
  switch (remedy) {
    case "FREE_MONTH": return "This month is on us";
    case "FREE_EXTENSION": return "We're keeping the sweep running — free";
    case "REFUND_DUE": return "Your guarantee refund is being processed";
  }
}

function remedyDetail(remedy: RemedyKind): string {
  switch (remedy) {
    case "FREE_MONTH": return "your next month is credited free and the agent keeps working.";
    case "FREE_EXTENSION": return "we're sweeping free for another 30 days to make good on the guarantee.";
    case "REFUND_DUE": return "we're refunding you and you keep the engine and every script.";
  }
}
