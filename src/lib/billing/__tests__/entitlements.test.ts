import { describe, it, expect } from "vitest";
import { resolveTier, planLimits, meterPeriodElapsed, readMeter, PLAN_LIMITS } from "@/lib/billing/entitlements";

describe("entitlements", () => {
  it("derives tier from billing state when planTier is unset", () => {
    expect(resolveTier({ planTier: null, billingStatus: "active" })).toBe("CONTINUITY");
    expect(resolveTier({ planTier: null, billingStatus: "trial" })).toBe("TRIAL");
    expect(resolveTier({ planTier: null, billingStatus: "incomplete" })).toBe("NONE");
    expect(resolveTier({ planTier: null, billingStatus: "past_due" })).toBe("NONE");
  });

  it("an explicit planTier overrides billing-derived tier", () => {
    expect(resolveTier({ planTier: "RESELLER", billingStatus: "active" })).toBe("RESELLER");
    expect(resolveTier({ planTier: "PERFORMANCE", billingStatus: "trial" })).toBe("PERFORMANCE");
  });

  it("ignores an unknown planTier and falls back to billing", () => {
    expect(resolveTier({ planTier: "BOGUS", billingStatus: "active" })).toBe("CONTINUITY");
  });

  it("continuity hard cap protects margin (6k) above its fair-use soft cap (3k)", () => {
    const l = planLimits({ planTier: null, billingStatus: "active" });
    expect(l.monthlyLeadsSoft).toBe(3000);
    expect(l.monthlyLeadsHard).toBe(6000);
    expect(l.unlimitedLists).toBe(true);
  });

  it("front-end tier is single-list and small (the $27 wow)", () => {
    expect(PLAN_LIMITS.FRONT_END.listLimit).toBe(1);
    expect(PLAN_LIMITS.FRONT_END.monthlyLeadsHard).toBe(150);
  });

  it("rolls the meter period at a new calendar month", () => {
    const start = new Date(Date.UTC(2026, 0, 15));
    expect(meterPeriodElapsed(start, new Date(Date.UTC(2026, 0, 28)))).toBe(false);
    expect(meterPeriodElapsed(start, new Date(Date.UTC(2026, 1, 1)))).toBe(true);
    expect(meterPeriodElapsed(start, new Date(Date.UTC(2027, 0, 1)))).toBe(true);
  });

  it("readMeter resets usage to zero in a new period and flags caps", () => {
    const base = { planTier: null, billingStatus: "active", leadsDraftedThisPeriod: 5000, meterPeriodStart: new Date(Date.UTC(2026, 0, 1)) };
    // Same month → counts, over soft, under hard.
    const now = new Date(Date.UTC(2026, 0, 20));
    const m = readMeter(base, now);
    expect(m.used).toBe(5000);
    expect(m.overSoft).toBe(true);
    expect(m.atHardCap).toBe(false);
    // New month → resets.
    const next = readMeter(base, new Date(Date.UTC(2026, 1, 2)));
    expect(next.used).toBe(0);
    expect(next.atHardCap).toBe(false);
  });

  it("flags the hard cap once used reaches it", () => {
    const m = readMeter(
      { planTier: null, billingStatus: "active", leadsDraftedThisPeriod: 6000, meterPeriodStart: new Date(Date.UTC(2026, 0, 1)) },
      new Date(Date.UTC(2026, 0, 20)),
    );
    expect(m.atHardCap).toBe(true);
  });
});
