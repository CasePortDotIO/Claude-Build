import { describe, it, expect } from "vitest";
import { gapArm, gapDaysFor, angleArm, experimentArm, GAP_ARM_DAYS, ANGLE_ARMS } from "@/lib/agent/experiments";

describe("experiment arms", () => {
  it("assigns the same arm to a lead every time (stable, no storage)", () => {
    for (const id of ["lead_a", "lead_b", "cuid123", "another"]) {
      expect(gapArm(id)).toBe(gapArm(id));
      expect(angleArm(id)).toBe(angleArm(id));
      expect(experimentArm(id)).toBe(experimentArm(id));
    }
  });

  it("maps each arm to a concrete behavior", () => {
    expect(Object.values(GAP_ARM_DAYS)).toEqual([2, 4]);
    for (const id of ["x", "y", "z"]) {
      expect([2, 4]).toContain(gapDaysFor(id));
      expect(ANGLE_ARMS).toContain(angleArm(id));
      expect(experimentArm(id)).toMatch(/^gap:[AB]\|angle:(goal-led|curiosity)$/);
    }
  });

  it("randomizes roughly evenly across leads (not confounded)", () => {
    let gapA = 0;
    let angleFirst = 0;
    const N = 2000;
    for (let i = 0; i < N; i++) {
      if (gapArm(`lead_${i}`) === "A") gapA++;
      if (angleArm(`lead_${i}`) === ANGLE_ARMS[0]) angleFirst++;
    }
    // A fair hash split should land well inside 40–60% for both experiments.
    expect(gapA / N).toBeGreaterThan(0.4);
    expect(gapA / N).toBeLessThan(0.6);
    expect(angleFirst / N).toBeGreaterThan(0.4);
    expect(angleFirst / N).toBeLessThan(0.6);
  });

  it("assigns gap and angle independently (different salts)", () => {
    // The two arms shouldn't be perfectly correlated across leads.
    let sameSideCount = 0;
    const N = 500;
    for (let i = 0; i < N; i++) {
      const gA = gapArm(`z_${i}`) === "A";
      const aFirst = angleArm(`z_${i}`) === ANGLE_ARMS[0];
      if (gA === aFirst) sameSideCount++;
    }
    // Independent arms → ~50% agreement, nowhere near 0% or 100%.
    expect(sameSideCount / N).toBeGreaterThan(0.35);
    expect(sameSideCount / N).toBeLessThan(0.65);
  });
});
