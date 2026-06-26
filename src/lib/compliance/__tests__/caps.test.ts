import { describe, it, expect } from "vitest";
import { warmupAllowance, effectiveDailyCap, autoPauseDecision, bounceRate } from "@/lib/compliance/caps";

// Minimal mailbox shape for the pure cap functions.
function mb(overrides: Partial<{ dailyCap: number; warmupStartedAt: Date; createdAt: Date; sentTotal: number; bounceCount: number; complaintCount: number }> = {}) {
  const now = new Date();
  return {
    dailyCap: 500,
    warmupStartedAt: now,
    createdAt: now,
    sentTotal: 0,
    bounceCount: 0,
    complaintCount: 0,
    ...overrides,
  } as never;
}

describe("warmup ramp", () => {
  it("ramps allowance up over the first days", () => {
    expect(warmupAllowance(1)).toBe(10);
    expect(warmupAllowance(2)).toBe(20);
    expect(warmupAllowance(4)).toBe(75);
    expect(warmupAllowance(99)).toBe(Infinity); // fully warmed
  });

  it("caps a brand-new mailbox to the day-1 allowance", () => {
    expect(effectiveDailyCap(mb({ dailyCap: 500 }))).toBe(10);
  });

  it("uses the configured cap once warmed", () => {
    const old = new Date(Date.now() - 30 * 86_400_000);
    expect(effectiveDailyCap(mb({ dailyCap: 40, warmupStartedAt: old, createdAt: old }))).toBe(40);
  });
});

describe("auto-pause thresholds", () => {
  it("does not pause below the minimum volume", () => {
    expect(autoPauseDecision(mb({ sentTotal: 5, bounceCount: 5 })).pause).toBe(false);
  });

  it("pauses when bounce rate exceeds 5%", () => {
    const d = autoPauseDecision(mb({ sentTotal: 100, bounceCount: 8 }));
    expect(d.pause).toBe(true);
    expect(d.reason).toMatch(/Bounce rate/);
  });

  it("pauses when complaint rate exceeds 0.1%", () => {
    const d = autoPauseDecision(mb({ sentTotal: 1000, complaintCount: 5 }));
    expect(d.pause).toBe(true);
    expect(d.reason).toMatch(/complaint/i);
  });

  it("stays healthy under thresholds", () => {
    expect(autoPauseDecision(mb({ sentTotal: 1000, bounceCount: 10, complaintCount: 0 })).pause).toBe(false);
    expect(bounceRate(mb({ sentTotal: 1000, bounceCount: 10 }))).toBeCloseTo(0.01);
  });
});
