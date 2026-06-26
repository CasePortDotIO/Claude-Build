import { describe, it, expect } from "vitest";
import { abLift, assignCohort, normalizeOpener, type CohortStat } from "@/lib/agent/rollups";

describe("A/B lift", () => {
  it("computes positive lift of treatment over holdout", () => {
    const stats: CohortStat[] = [
      { cohort: "TREATMENT", contacted: 100, replied: 30, booked: 5, replyRate: 0.3, bookRate: 0.05 },
      { cohort: "HOLDOUT", contacted: 20, replied: 3, booked: 0, replyRate: 0.15, bookRate: 0 },
    ];
    const { liftPct } = abLift(stats);
    expect(liftPct).toBeCloseTo(100); // 0.30 vs 0.15 → +100%
  });

  it("returns null lift when holdout has no data", () => {
    const stats: CohortStat[] = [
      { cohort: "TREATMENT", contacted: 10, replied: 4, booked: 0, replyRate: 0.4, bookRate: 0 },
      { cohort: "HOLDOUT", contacted: 0, replied: 0, booked: 0, replyRate: 0, bookRate: 0 },
    ];
    expect(abLift(stats).liftPct).toBeNull();
  });
});

describe("cohort assignment", () => {
  it("is deterministic for the same (org, lead)", () => {
    const a = assignCohort("org1", "leadA");
    const b = assignCohort("org1", "leadA");
    expect(a).toBe(b);
  });

  it("keeps the holdout share roughly near the target", () => {
    let holdout = 0;
    const N = 2000;
    for (let i = 0; i < N; i++) if (assignCohort("orgX", `lead-${i}`, 15) === "HOLDOUT") holdout += 1;
    const pct = (holdout / N) * 100;
    expect(pct).toBeGreaterThan(8);
    expect(pct).toBeLessThan(22);
  });
});

describe("opener normalization", () => {
  it("collapses to a comparable key", () => {
    expect(normalizeOpener("Back When We First   Spoke, you were focused on X Y Z extra words here")).toBe(
      "back when we first spoke, you were focused",
    );
  });
});
