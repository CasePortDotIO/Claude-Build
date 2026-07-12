import { createHash } from "node:crypto";

/**
 * Randomized experiment arms for the outcome corpus. Assignment is a stable hash
 * of the leadId (salted per experiment) — so it's uniformly random across leads,
 * identical every time we look it up (touch 1 and touch 3 get the same arm), and
 * needs NO stored column. The arm both DRIVES behavior (which follow-up gap, which
 * opening angle) and is LOGGED on every outcome, so message/timing effects read as
 * causal instead of confounded.
 *
 * This is the whole experimental apparatus for cohort one — two arms, assigned +
 * logged. No scoring, no model, no prescription: just clean, controlled capture.
 */

function bucket(leadId: string, salt: string, n: number): number {
  const h = createHash("sha256").update(`${salt}:${leadId}`).digest();
  return h.readUInt32BE(0) % n;
}

// The fixed baseline the HOLDOUT control gets — the pre-experiment default, so
// treatment lift is measured against a real "do the normal thing" counterfactual.
export const BASELINE_GAP_DAYS = 3;

// Arm 1 — follow-up gap. Straddles the baseline (3d) so the experiment measures
// whether a tighter or looser cadence recovers more, holding message constant.
export const GAP_ARM_DAYS = { A: 2, B: 4 } as const;
export type GapArm = keyof typeof GAP_ARM_DAYS;

export function gapArm(leadId: string): GapArm {
  return bucket(leadId, "gap", 2) === 0 ? "A" : "B";
}
export function gapDaysFor(leadId: string): number {
  return GAP_ARM_DAYS[gapArm(leadId)];
}

// Arm 2 — opening angle. Chosen among angles the drafter already produces, so the
// randomization picks between two viable variants rather than degrading copy.
export const ANGLE_ARMS = ["goal-led", "curiosity"] as const;
export type AngleArm = (typeof ANGLE_ARMS)[number];

export function angleArm(leadId: string): AngleArm {
  return ANGLE_ARMS[bucket(leadId, "angle", ANGLE_ARMS.length)];
}

/** The composite arm label logged on every outcome, e.g. "gap:A|angle:curiosity". */
export function experimentArm(leadId: string): string {
  return `gap:${gapArm(leadId)}|angle:${angleArm(leadId)}`;
}
