import { isBillingConfigured } from "@/lib/billing/stripe";

/**
 * Entitlements + margin governance. Each tier maps to concrete limits; the
 * fresh-lead DRAFT meter (soft = fair-use ceiling, hard = kill-switch) is what
 * keeps LLM cost inside the 80–90% margin band no matter how big a list a
 * customer uploads. Numbers are the agreed defaults — see the margin model.
 */
export type PlanTier =
  | "NONE"
  | "TRIAL"
  | "FRONT_END"
  | "OTO1"
  | "CONTINUITY"
  | "PERFORMANCE"
  | "RESELLER";

export interface PlanLimits {
  listLimit: number; // Number.POSITIVE_INFINITY for unlimited
  monthlyLeadsSoft: number; // fair-use ceiling (upsell signal)
  monthlyLeadsHard: number; // kill-switch: drafting halts past this
  unlimitedLists: boolean;
  alwaysOn: boolean; // autopilot eligibility
  subAccounts: number; // reseller
}

const INF = Number.POSITIVE_INFINITY;

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  NONE: { listLimit: 0, monthlyLeadsSoft: 0, monthlyLeadsHard: 0, unlimitedLists: false, alwaysOn: false, subAccounts: 0 },
  // Comped beta trial — enough to feel the wow, cheap to give away.
  TRIAL: { listLimit: 1, monthlyLeadsSoft: 250, monthlyLeadsHard: 300, unlimitedLists: false, alwaysOn: false, subAccounts: 0 },
  // $27 front end — "your first 100", drawn on the cheap model.
  FRONT_END: { listLimit: 1, monthlyLeadsSoft: 100, monthlyLeadsHard: 150, unlimitedLists: false, alwaysOn: false, subAccounts: 0 },
  // $197 OTO1 — unlimited lists + a one-time processing quota (no always-on funding trap).
  OTO1: { listLimit: INF, monthlyLeadsSoft: 2500, monthlyLeadsHard: 3000, unlimitedLists: true, alwaysOn: true, subAccounts: 0 },
  // $297/mo continuity — market "unlimited", meter ~3k, hard-cap 6k → ~90% margin.
  CONTINUITY: { listLimit: INF, monthlyLeadsSoft: 3000, monthlyLeadsHard: 6000, unlimitedLists: true, alwaysOn: true, subAccounts: 0 },
  // $97/mo + per-call — low base needs its own cap so it can't bleed.
  PERFORMANCE: { listLimit: INF, monthlyLeadsSoft: 1000, monthlyLeadsHard: 1500, unlimitedLists: true, alwaysOn: true, subAccounts: 0 },
  // $497/mo reseller — multi-client; total throughput across subs is what's metered.
  RESELLER: { listLimit: INF, monthlyLeadsSoft: 6000, monthlyLeadsHard: 8000, unlimitedLists: true, alwaysOn: true, subAccounts: 5 },
};

export interface OrgPlanFields {
  planTier: string | null;
  billingStatus: string;
  leadsDraftedThisPeriod: number;
  meterPeriodStart: Date;
}

/**
 * The org's effective tier. An explicit planTier (set by the Stripe webhook per
 * purchased price) wins; otherwise derive from billing state so the single
 * $297 plan sold today resolves to CONTINUITY and comps resolve to TRIAL.
 */
export function resolveTier(org: Pick<OrgPlanFields, "planTier" | "billingStatus">): PlanTier {
  if (org.planTier && org.planTier in PLAN_LIMITS) return org.planTier as PlanTier;
  switch (org.billingStatus) {
    case "active":
      return "CONTINUITY";
    case "trial":
      return "TRIAL";
    default:
      return "NONE";
  }
}

export function planLimits(org: Pick<OrgPlanFields, "planTier" | "billingStatus">): PlanLimits {
  return PLAN_LIMITS[resolveTier(org)];
}

/** True once the meter's period rolled into a new calendar month. */
export function meterPeriodElapsed(meterPeriodStart: Date, now: Date): boolean {
  return (
    meterPeriodStart.getUTCFullYear() !== now.getUTCFullYear() ||
    meterPeriodStart.getUTCMonth() !== now.getUTCMonth()
  );
}

export interface MeterState {
  used: number;
  soft: number;
  hard: number;
  overSoft: boolean;
  atHardCap: boolean;
}

/** Read the current meter for display/upsell (never enforces). */
export function readMeter(org: OrgPlanFields, now: Date): MeterState {
  const limits = planLimits(org);
  const used = meterPeriodElapsed(org.meterPeriodStart, now) ? 0 : org.leadsDraftedThisPeriod;
  return {
    used,
    soft: limits.monthlyLeadsSoft,
    hard: limits.monthlyLeadsHard,
    overSoft: used >= limits.monthlyLeadsSoft,
    atHardCap: used >= limits.monthlyLeadsHard,
  };
}

/**
 * Whether billing enforcement is active at all. Local/dev/CI (no Stripe keys)
 * runs unmetered so tests and setup aren't blocked — mirrors the paywall gate.
 */
export async function meteringActive(): Promise<boolean> {
  return isBillingConfigured();
}
