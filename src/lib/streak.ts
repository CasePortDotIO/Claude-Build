import { prisma } from "@/lib/prisma";

/**
 * Engagement streak (M10) — the "don't break the chain" habit lever.
 *
 * Computed as a *view* over the audit trail (no stored counter to drift out of
 * sync). A day counts as "active" when the operator did real work — reviewed a
 * draft (approve OR reject), or ran a sweep. Rejecting counts on purpose: we
 * never want the streak to pressure someone into approving a draft they
 * shouldn't. The qualifying action is engagement, not a hollow login, and not
 * specifically saying yes.
 *
 * Day boundaries are UTC for now (we don't store the operator's timezone); a
 * future pass can localize once we capture it.
 */

const ENGAGE_ACTIONS = ["draft.approve", "draft.reject", "lead.import"];
const DAY_MS = 86_400_000;
const LOOKBACK_DAYS = 90;

export interface StreakDay {
  date: string; // YYYY-MM-DD (UTC)
  active: boolean;
  isToday: boolean;
}
export interface StreakState {
  current: number;
  longest: number;
  activeToday: boolean;
  atRisk: boolean; // alive from yesterday but not yet extended today — the nudge case
  week: StreakDay[]; // last 7 days, oldest → today
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function engagementStreak(orgId: string, now: Date = new Date()): Promise<StreakState> {
  const since = new Date(now.getTime() - LOOKBACK_DAYS * DAY_MS);
  const logs = await prisma.auditLog.findMany({
    where: { orgId, action: { in: ENGAGE_ACTIONS }, createdAt: { gte: since } },
    select: { createdAt: true },
  });
  const active = new Set(logs.map((l) => dayKey(l.createdAt)));

  const todayKey = dayKey(now);
  const activeToday = active.has(todayKey);

  // Current streak: count consecutive active days walking back from the anchor.
  // Anchor = today if active, else yesterday if active (1-day grace so the streak
  // stays "alive" until the end of today), else there is no live streak.
  let current = 0;
  let anchor: Date | null = null;
  if (activeToday) anchor = new Date(now);
  else if (active.has(dayKey(new Date(now.getTime() - DAY_MS)))) anchor = new Date(now.getTime() - DAY_MS);

  if (anchor) {
    const cursor = new Date(anchor);
    while (active.has(dayKey(cursor))) {
      current += 1;
      cursor.setTime(cursor.getTime() - DAY_MS);
    }
  }

  return {
    current,
    longest: Math.max(current, longestRun(active)),
    activeToday,
    atRisk: current > 0 && !activeToday,
    week: buildWeek(active, now),
  };
}

/** Longest run of consecutive active days anywhere in the window. */
function longestRun(active: Set<string>): number {
  if (active.size === 0) return 0;
  const days = [...active].sort();
  let best = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    const prev = new Date(`${days[i - 1]}T00:00:00Z`).getTime();
    const cur = new Date(`${days[i]}T00:00:00Z`).getTime();
    if (cur - prev === DAY_MS) {
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 1;
    }
  }
  return best;
}

function buildWeek(active: Set<string>, now: Date): StreakDay[] {
  const out: StreakDay[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * DAY_MS);
    const key = dayKey(d);
    out.push({ date: key, active: active.has(key), isToday: i === 0 });
  }
  return out;
}
