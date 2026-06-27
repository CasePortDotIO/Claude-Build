import { prisma } from "@/lib/prisma";
import { BOOKED_STATUSES } from "@/lib/booking-status";

/**
 * The performance guarantee (§8): "book at least X calls in 30 days or you don't
 * pay." For that promise to be settled by facts instead of arguments it must be
 * measurable in-product, per customer, on a rolling 30-day window.
 *
 * THE THRESHOLD LIVES HERE AND ONLY HERE. Everything that needs X reads it from
 * this module (or the per-org override) — never a hard-coded duplicate.
 */
export const GUARANTEE_CALLS_DEFAULT = 10;
export const GUARANTEE_WINDOW_DAYS = 30;

export interface GuaranteeStatus {
  threshold: number; // X
  booked: number; // booked calls in the trailing window
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

export async function guaranteeStatus(orgId: string, now: Date = new Date()): Promise<GuaranteeStatus> {
  const windowStart = new Date(now.getTime() - GUARANTEE_WINDOW_DAYS * 86_400_000);
  const [org, booked] = await Promise.all([
    prisma.org.findUnique({ where: { id: orgId }, select: { guaranteeCalls: true } }),
    prisma.booking.count({ where: { orgId, status: { in: BOOKED_STATUSES }, createdAt: { gte: windowStart } } }),
  ]);

  const threshold = guaranteeThreshold(org);
  const met = booked >= threshold;
  return {
    threshold,
    booked,
    windowDays: GUARANTEE_WINDOW_DAYS,
    met,
    remaining: Math.max(0, threshold - booked),
    progressPct: threshold > 0 ? Math.min(100, Math.round((booked / threshold) * 100)) : 100,
    windowStart,
  };
}
