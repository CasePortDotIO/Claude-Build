import { prisma } from "@/lib/prisma";
import { ensureGuaranteeWindow } from "@/lib/guarantee";

/**
 * Entitlement grants for one-time purchases. A one-time buyer has no
 * subscription, so access is granted by flipping billingStatus to "active"
 * (which the paywall + send gate accept) and stamping the purchased tier. The
 * Founding tripwire carries a TOTAL lead quota (100, or 500 with the +$17 backlog
 * bump); Own-It is unlimited. The tier's booked-call guarantee opens immediately.
 */

const FOUNDING_QUOTA = 100;
const FOUNDING_QUOTA_BUMPED = 500;

export async function grantOneTimeTier(opts: {
  orgId: string;
  tier: "FRONT_END" | "OTO1";
  bump?: boolean;
  customerId?: string;
}): Promise<void> {
  const oneTimeLeadQuota =
    opts.tier === "FRONT_END" ? (opts.bump ? FOUNDING_QUOTA_BUMPED : FOUNDING_QUOTA) : null;

  await prisma.org.update({
    where: { id: opts.orgId },
    data: {
      billingStatus: "active", // lifetime access; no subscription for one-time tiers
      planTier: opts.tier,
      oneTimeLeadQuota,
      canceledAt: null,
      ...(opts.customerId ? { stripeCustomerId: opts.customerId } : {}),
    },
  });

  // Attach the tier's booked-call guarantee (3-in-30 for Founding / Own-It).
  await ensureGuaranteeWindow(opts.orgId).catch(() => {});
}

/**
 * Remaining lifetime lead quota for a one-time tier. null quota → unlimited
 * (Own-It / subscription tiers). Used to cap an import so a $27 buyer can only
 * ever sweep their first 100 (or 500) leads — protecting margin on a one-time fee.
 */
export function remainingOneTimeQuota(quota: number | null | undefined, currentLeadCount: number): number {
  if (quota == null) return Number.POSITIVE_INFINITY;
  return Math.max(0, quota - currentLeadCount);
}
