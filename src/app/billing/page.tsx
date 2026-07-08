import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { requireOrg } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { ROLE_RANK } from "@/lib/roles";
import { isBillingConfigured, planDisplay, subscriptionActive } from "@/lib/billing/stripe";
import { BillingWall } from "@/components/billing/BillingWall";

export const metadata: Metadata = { title: "Activate your workspace · The Warm Sweep" };

/**
 * Paid-only billing wall, OUTSIDE the (app) layout so the subscription gate
 * there can redirect here without a loop. Sends already-active orgs back into
 * the app, and (when billing isn't configured) gets out of the way entirely.
 */
export default async function BillingPage() {
  const ctx = await requireOrg();

  // No payment system wired → nothing to enforce; let them into the app.
  if (!(await isBillingConfigured())) redirect("/");

  const [org, plan] = await Promise.all([
    prisma.org.findUniqueOrThrow({
      where: { id: ctx.orgId },
      select: { name: true, brandName: true, billingStatus: true },
    }),
    planDisplay(),
  ]);

  // Already paid → into the app.
  if (subscriptionActive(org.billingStatus)) redirect("/");

  const isAdmin = ROLE_RANK[ctx.role] >= ROLE_RANK.CLIENT_ADMIN;

  return (
    <div className="flex min-h-screen items-center justify-center bg-parchment px-6 py-12">
      <BillingWall
        isAdmin={isAdmin}
        planName={plan.name}
        priceLabel={plan.price}
        orgName={org.brandName || org.name}
        billingStatus={org.billingStatus}
      />
    </div>
  );
}
