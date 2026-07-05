import { describe, it, expect } from "vitest";
import { resolveTier, planLimits, meterPeriodElapsed, readMeter, PLAN_LIMITS, capabilityAllowed } from "@/lib/billing/entitlements";

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

  it("matrix matches the Promise Ledger — founding single-pass/DFY, own-it manual/multi", () => {
    // Founding $27: single-pass sweep, DFY, not always-on.
    expect(PLAN_LIMITS.FRONT_END.maxTouches).toBe(1);
    expect(PLAN_LIMITS.FRONT_END.dfySetup).toBe(true);
    expect(PLAN_LIMITS.FRONT_END.alwaysOn).toBe(false);
    // Own-It $197: buyer-operated — multi-touch, unlimited lists, but MANUAL (not always-on), no DFY.
    expect(PLAN_LIMITS.OTO1.maxTouches).toBeGreaterThan(1);
    expect(PLAN_LIMITS.OTO1.unlimitedLists).toBe(true);
    expect(PLAN_LIMITS.OTO1.alwaysOn).toBe(false);
    expect(PLAN_LIMITS.OTO1.dfySetup).toBe(false);
    // Continuity $297: always-on + speed-to-lead + monthly report.
    expect(PLAN_LIMITS.CONTINUITY.alwaysOn).toBe(true);
    expect(PLAN_LIMITS.CONTINUITY.speedToLead).toBe(true);
    expect(PLAN_LIMITS.CONTINUITY.monthlyReport).toBe(true);
    // Reseller Standard 15 clients; Agency unlimited.
    expect(PLAN_LIMITS.RESELLER.subAccounts).toBe(15);
    expect(PLAN_LIMITS.AGENCY.subAccounts).toBe(Number.POSITIVE_INFINITY);
  });

  it("capabilityAllowed gates lists by count and fails closed on unknown caps", () => {
    // Single-list tier: first list allowed, second denied.
    expect(capabilityAllowed(PLAN_LIMITS.FRONT_END, "lists.create", 0)).toBe(true);
    expect(capabilityAllowed(PLAN_LIMITS.FRONT_END, "lists.create", 1)).toBe(false);
    // Unlimited-list tier: always allowed regardless of count.
    expect(capabilityAllowed(PLAN_LIMITS.CONTINUITY, "lists.create", 999)).toBe(true);
    // Reseller sub-accounts capped at 15.
    expect(capabilityAllowed(PLAN_LIMITS.RESELLER, "subaccount.create", 14)).toBe(true);
    expect(capabilityAllowed(PLAN_LIMITS.RESELLER, "subaccount.create", 15)).toBe(false);
    // Always-on only on recurring/manual-plus tiers.
    expect(capabilityAllowed(PLAN_LIMITS.OTO1, "autopilot.alwaysOn")).toBe(false);
    expect(capabilityAllowed(PLAN_LIMITS.CONTINUITY, "autopilot.alwaysOn")).toBe(true);
    // Multi-touch gated by depth.
    expect(capabilityAllowed(PLAN_LIMITS.FRONT_END, "sequence.multitouch")).toBe(false);
    expect(capabilityAllowed(PLAN_LIMITS.OTO1, "sequence.multitouch")).toBe(true);
    // Unknown capability → deny.
    expect(capabilityAllowed(PLAN_LIMITS.CONTINUITY, "bogus.capability" as never)).toBe(false);
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
