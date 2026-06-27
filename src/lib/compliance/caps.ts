import type { Mailbox } from "@prisma/client";

/**
 * Sending caps + domain warmup + auto-pause thresholds (§9 deliverability).
 *
 * Warmup: a new sending domain must ramp volume gradually or filters flag it.
 * The effective daily cap is the smaller of the operator's configured cap and
 * the warmup allowance for the mailbox's current age in days.
 */

// Allowance by warmup day (1-indexed). After the schedule, the configured cap.
const WARMUP_SCHEDULE = [0, 10, 20, 40, 75, 125, 200, 300, 400, 500];

export function warmupDay(mailbox: Pick<Mailbox, "warmupStartedAt" | "createdAt">): number {
  const start = mailbox.warmupStartedAt ?? mailbox.createdAt;
  const ms = Date.now() - new Date(start).getTime();
  return Math.max(1, Math.floor(ms / 86_400_000) + 1);
}

export function warmupAllowance(day: number): number {
  if (day >= WARMUP_SCHEDULE.length) return Infinity; // fully warmed → cap governs
  return WARMUP_SCHEDULE[day] ?? Infinity;
}

/** The cap actually enforced today = min(configured daily cap, warmup allowance). */
export function effectiveDailyCap(mailbox: Mailbox): number {
  return Math.min(mailbox.dailyCap, warmupAllowance(warmupDay(mailbox)));
}

export function isWarmingUp(mailbox: Mailbox): boolean {
  return warmupDay(mailbox) < WARMUP_SCHEDULE.length;
}

// Two-tier deliverability thresholds (§4). Need a minimum volume before a rate
// is statistically meaningful. ALERT = warn the operator early; HARD STOP =
// trip the circuit breaker and auto-pause.
const MIN_VOLUME_FOR_RATE = 20;
const BOUNCE_ALERT = 0.02; // 2% — filters start to notice
const BOUNCE_HARDSTOP = 0.05; // 5% — pause now
const COMPLAINT_ALERT = 0.001; // 0.1%
const COMPLAINT_HARDSTOP = 0.003; // 0.3% — pause now

export function bounceRate(mailbox: Pick<Mailbox, "bounceCount" | "sentTotal">): number {
  return mailbox.sentTotal > 0 ? mailbox.bounceCount / mailbox.sentTotal : 0;
}
export function complaintRate(mailbox: Pick<Mailbox, "complaintCount" | "sentTotal">): number {
  return mailbox.sentTotal > 0 ? mailbox.complaintCount / mailbox.sentTotal : 0;
}

/** Hard-stop decision — crossing this auto-pauses the mailbox (circuit breaker). */
export function autoPauseDecision(mailbox: Mailbox): { pause: boolean; reason?: string } {
  if (mailbox.sentTotal < MIN_VOLUME_FOR_RATE) return { pause: false };
  if (bounceRate(mailbox) > BOUNCE_HARDSTOP) {
    return { pause: true, reason: `Bounce rate ${(bounceRate(mailbox) * 100).toFixed(1)}% exceeds ${BOUNCE_HARDSTOP * 100}%` };
  }
  if (complaintRate(mailbox) > COMPLAINT_HARDSTOP) {
    return { pause: true, reason: `Spam-complaint rate ${(complaintRate(mailbox) * 100).toFixed(2)}% exceeds ${COMPLAINT_HARDSTOP * 100}%` };
  }
  return { pause: false };
}

/** Early-warning tier — surfaced on Deliverability before a hard stop trips. */
export function rateAlert(mailbox: Pick<Mailbox, "bounceCount" | "complaintCount" | "sentTotal">): { level: "ok" | "alert"; reason?: string } {
  if (mailbox.sentTotal < MIN_VOLUME_FOR_RATE) return { level: "ok" };
  if (bounceRate(mailbox) > BOUNCE_ALERT) return { level: "alert", reason: `Bounce rate ${(bounceRate(mailbox) * 100).toFixed(1)}% over the ${BOUNCE_ALERT * 100}% alert line` };
  if (complaintRate(mailbox) > COMPLAINT_ALERT) return { level: "alert", reason: `Complaint rate ${(complaintRate(mailbox) * 100).toFixed(2)}% over the ${COMPLAINT_ALERT * 100}% alert line` };
  return { level: "ok" };
}

export const CAP_LIMITS = { BOUNCE_ALERT, BOUNCE_HARDSTOP, COMPLAINT_ALERT, COMPLAINT_HARDSTOP, MIN_VOLUME_FOR_RATE };
