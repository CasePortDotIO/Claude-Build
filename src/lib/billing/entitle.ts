import { prisma } from "@/lib/prisma";
import { getSecret } from "@/lib/config/secrets";
import { EntitlementError } from "@/lib/billing/entitlement-errors";
import {
  PLAN_LIMITS,
  UNLIMITED_LIMITS,
  planLimits,
  capabilityAllowed,
  entitlementsActive,
  type Capability,
  type PlanLimits,
  type PlanTier,
} from "@/lib/billing/entitlements";

/**
 * Tier entitlement enforcement — the fail-closed gate every capability door
 * calls. The policy (which tier gets what) lives in entitlements.ts; this is the
 * DB-touching layer that resolves an org's tier, counts current usage for
 * count-based caps, and throws EntitlementError when a tier tries to exceed its
 * unlock.
 *
 * Unenforced when billing isn't configured (local/dev/CI) — mirrors the draft
 * meter and the paywall — so tests and setup are never blocked.
 */

// Upsell-framed, client-facing messages. Never leak tier internals.
const MESSAGES: Record<Capability, string> = {
  "lists.create": "Your plan includes a single lead list. Upgrade to run unlimited lists.",
  "subaccount.create": "You've reached your plan's client limit. Upgrade your reseller plan to add more clients.",
  "sequence.multitouch": "Multi-touch follow-up is available on a higher plan. Upgrade to keep working a lead past the first message.",
  "autopilot.alwaysOn": "Always-on autopilot is part of the monthly plan. Upgrade to let the agent run 24/7.",
  speedToLead: "Speed-to-Lead (5-minute new-lead follow-up) is part of the monthly plan.",
  "report.monthly": "Monthly performance reports are part of the monthly plan.",
  "dfy.setup": "Done-for-you setup is included on the founding and monthly plans.",
};

/** The org's effective limits — UNLIMITED when entitlements aren't enforced. */
export async function resolveLimits(orgId: string): Promise<PlanLimits> {
  if (!(await entitlementsActive())) return UNLIMITED_LIMITS;
  const org = await prisma.org.findUnique({ where: { id: orgId }, select: { planTier: true, billingStatus: true } });
  if (!org) return UNLIMITED_LIMITS;
  return planLimits(org);
}

/** Current usage count for the count-based capabilities (0 for boolean caps). */
async function usageCount(orgId: string, cap: Capability): Promise<number> {
  if (cap === "lists.create") return prisma.leadImport.count({ where: { orgId } });
  if (cap === "subaccount.create") return prisma.org.count({ where: { parentAgencyId: orgId, type: "CLIENT" } });
  return 0;
}

/**
 * Throw EntitlementError if `orgId`'s tier can't use `cap`. No-op when billing
 * isn't configured. Call this at the capability's single chokepoint (list ingest,
 * autopilot toggle, client creation, …) — the door, not the UI.
 */
export async function assertEntitled(orgId: string, cap: Capability): Promise<void> {
  if (!(await entitlementsActive())) return;
  const org = await prisma.org.findUnique({ where: { id: orgId }, select: { planTier: true, billingStatus: true } });
  if (!org) return;
  const limits = planLimits(org);
  const count = await usageCount(orgId, cap);
  if (!capabilityAllowed(limits, cap, count)) {
    throw new EntitlementError(MESSAGES[cap], cap);
  }
}

/**
 * Map a purchased Stripe price to the tier it unlocks. Configured via the
 * STRIPE_PRICE_TIERS secret (JSON: {"price_abc":"CONTINUITY", ...}); the single
 * default STRIPE_PRICE_ID falls back to CONTINUITY (the plan sold today). Returns
 * null when the price isn't recognized — the webhook then leaves planTier
 * untouched and resolveTier derives it from billing state.
 */
export async function tierForPrice(priceId: string | null | undefined): Promise<PlanTier | null> {
  if (!priceId) return null;
  const raw = await getSecret("STRIPE_PRICE_TIERS");
  if (raw) {
    try {
      const map = JSON.parse(raw) as Record<string, string>;
      const t = map[priceId];
      if (t && t in PLAN_LIMITS) return t as PlanTier;
    } catch {
      // Malformed config → ignore and fall through to the default mapping.
    }
  }
  const def = await getSecret("STRIPE_PRICE_ID");
  if (def && priceId === def) return "CONTINUITY";
  return null;
}
