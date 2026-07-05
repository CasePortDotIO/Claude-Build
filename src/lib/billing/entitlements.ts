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
  | "RESELLER"
  | "AGENCY";

export interface PlanLimits {
  listLimit: number; // Number.POSITIVE_INFINITY for unlimited
  monthlyLeadsSoft: number; // fair-use ceiling (upsell signal)
  monthlyLeadsHard: number; // kill-switch: drafting halts past this
  unlimitedLists: boolean;
  alwaysOn: boolean; // autopilot eligibility (always-on 24/7)
  subAccounts: number; // reseller child-client cap (INF = unlimited)
  maxTouches: number; // sequence depth: 1 = single-pass, >1 = multi-touch
  speedToLead: boolean; // ≤5-min new-lead follow-up eligibility
  monthlyReport: boolean; // generated monthly performance report
  dfySetup: boolean; // done-for-you setup / operated by the team
}

const INF = Number.POSITIVE_INFINITY;

// The default multi-touch depth (first send + 3 follow-ups incl. breakup). Used
// as the ungated depth when billing isn't configured (dev/CI).
export const DEFAULT_MAX_TOUCHES = 4;

// Values match the Promise Ledger Entitlement Matrix — the load-bearing table.
// Get these wrong and features leak across tiers.
export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  NONE: { listLimit: 0, monthlyLeadsSoft: 0, monthlyLeadsHard: 0, unlimitedLists: false, alwaysOn: false, subAccounts: 0, maxTouches: 0, speedToLead: false, monthlyReport: false, dfySetup: false },
  // Comped beta trial — enough to feel the wow, cheap to give away.
  TRIAL: { listLimit: 1, monthlyLeadsSoft: 250, monthlyLeadsHard: 300, unlimitedLists: false, alwaysOn: false, subAccounts: 0, maxTouches: DEFAULT_MAX_TOUCHES, speedToLead: false, monthlyReport: false, dfySetup: false },
  // $27 front end — DFY single-pass sweep over the first 100 of ONE list.
  FRONT_END: { listLimit: 1, monthlyLeadsSoft: 100, monthlyLeadsHard: 150, unlimitedLists: false, alwaysOn: false, subAccounts: 0, maxTouches: 1, speedToLead: false, monthlyReport: false, dfySetup: true },
  // $197 OTO1 — buyer-operated: unlimited lists, multi-touch, but MANUAL (not always-on) and self-serve (no DFY). One-time processing quota, no always-on funding trap.
  OTO1: { listLimit: INF, monthlyLeadsSoft: 2500, monthlyLeadsHard: 3000, unlimitedLists: true, alwaysOn: false, subAccounts: 0, maxTouches: DEFAULT_MAX_TOUCHES, speedToLead: false, monthlyReport: false, dfySetup: false },
  // $297/mo continuity — the flagship: always-on, speed-to-lead, monthly report, DFY setup. Market "unlimited", meter ~3k, hard-cap 6k → ~90% margin.
  CONTINUITY: { listLimit: INF, monthlyLeadsSoft: 3000, monthlyLeadsHard: 6000, unlimitedLists: true, alwaysOn: true, subAccounts: 0, maxTouches: DEFAULT_MAX_TOUCHES, speedToLead: true, monthlyReport: true, dfySetup: true },
  // $97/mo + per-call — always-on + speed-to-lead, low base needs its own cap so it can't bleed.
  PERFORMANCE: { listLimit: INF, monthlyLeadsSoft: 1000, monthlyLeadsHard: 1500, unlimitedLists: true, alwaysOn: true, subAccounts: 0, maxTouches: DEFAULT_MAX_TOUCHES, speedToLead: true, monthlyReport: false, dfySetup: false },
  // $497/mo reseller (Standard) — up to 15 client accounts; total throughput across subs is what's metered.
  RESELLER: { listLimit: INF, monthlyLeadsSoft: 6000, monthlyLeadsHard: 8000, unlimitedLists: true, alwaysOn: true, subAccounts: 15, maxTouches: DEFAULT_MAX_TOUCHES, speedToLead: true, monthlyReport: true, dfySetup: false },
  // $997/mo agency — unlimited client accounts + priority; higher shared throughput band.
  AGENCY: { listLimit: INF, monthlyLeadsSoft: 15000, monthlyLeadsHard: 20000, unlimitedLists: true, alwaysOn: true, subAccounts: INF, maxTouches: DEFAULT_MAX_TOUCHES, speedToLead: true, monthlyReport: true, dfySetup: false },
};

// The ungated "everything on" limits — returned when billing isn't configured
// (dev/CI) so tests, setup, and local runs are never blocked by entitlements.
export const UNLIMITED_LIMITS: PlanLimits = {
  listLimit: INF, monthlyLeadsSoft: INF, monthlyLeadsHard: INF, unlimitedLists: true, alwaysOn: true, subAccounts: INF,
  maxTouches: DEFAULT_MAX_TOUCHES, speedToLead: true, monthlyReport: true, dfySetup: true,
};

/**
 * Every tier-gated capability. Gating flows through one place (capabilityAllowed
 * → assertEntitled) so a feature can't silently leak across tiers. Unknown
 * capabilities fail CLOSED.
 */
export type Capability =
  | "lists.create" // create another lead list (listLimit / unlimitedLists)
  | "subaccount.create" // add a reseller child-client (subAccounts)
  | "sequence.multitouch" // follow-ups beyond the first send (maxTouches)
  | "autopilot.alwaysOn" // run the agent 24/7 (alwaysOn)
  | "speedToLead" // ≤5-min new-lead follow-up
  | "report.monthly" // generated monthly performance report
  | "dfy.setup"; // done-for-you setup by the team

/**
 * Pure capability check. `count` is the current usage for count-based caps
 * (lists.create → existing list count; subaccount.create → existing clients).
 * Fails closed on any capability we don't recognize.
 */
export function capabilityAllowed(limits: PlanLimits, cap: Capability, count = 0): boolean {
  switch (cap) {
    case "lists.create": return limits.unlimitedLists || count < limits.listLimit;
    case "subaccount.create": return count < limits.subAccounts;
    case "sequence.multitouch": return limits.maxTouches > 1;
    case "autopilot.alwaysOn": return limits.alwaysOn;
    case "speedToLead": return limits.speedToLead;
    case "report.monthly": return limits.monthlyReport;
    case "dfy.setup": return limits.dfySetup;
    default: return false; // unknown capability → deny
  }
}

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

/**
 * Whether tier entitlements are enforced. Same gate as metering: local/dev/CI
 * (no Stripe keys) runs with UNLIMITED_LIMITS so nothing is blocked; once billing
 * is configured, each tier's caps bite.
 */
export async function entitlementsActive(): Promise<boolean> {
  return isBillingConfigured();
}
