"use server";

import { prisma } from "@/lib/prisma";
import { requireOrg, assertRole } from "@/lib/auth-helpers";
import { isBillingConfigured, createCustomer, createCheckoutSession, createPortalSession } from "@/lib/billing/stripe";

export interface BillingActionResult {
  ok: boolean;
  url?: string;
  error?: string;
}

function baseUrl(): string {
  return process.env.NEXTAUTH_URL || "http://localhost:3000";
}

/** Start a Stripe Checkout session for the active org. Admin-only. Returns a URL to redirect to. */
export async function startCheckoutAction(): Promise<BillingActionResult> {
  const ctx = await requireOrg();
  try {
    assertRole(ctx, "CLIENT_ADMIN");
  } catch {
    return { ok: false, error: "Only an admin can manage billing." };
  }
  if (!(await isBillingConfigured())) return { ok: false, error: "Billing isn't enabled yet." };

  try {
    const org = await prisma.org.findUniqueOrThrow({
      where: { id: ctx.orgId },
      select: { name: true, brandName: true, stripeCustomerId: true },
    });
    let customerId = org.stripeCustomerId;
    if (!customerId) {
      customerId = await createCustomer({ email: ctx.email, name: org.brandName || org.name, orgId: ctx.orgId });
      await prisma.org.update({ where: { id: ctx.orgId }, data: { stripeCustomerId: customerId } });
    }
    const url = await createCheckoutSession({
      customerId,
      orgId: ctx.orgId,
      successUrl: `${baseUrl()}/account?checkout=success`,
      cancelUrl: `${baseUrl()}/account?checkout=cancelled`,
    });
    return { ok: true, url };
  } catch (err) {
    console.error("checkout failed:", err);
    return { ok: false, error: "Couldn't start checkout — try again." };
  }
}

/** Open the Stripe billing portal (manage/cancel/update card). Admin-only. */
export async function openBillingPortalAction(): Promise<BillingActionResult> {
  const ctx = await requireOrg();
  try {
    assertRole(ctx, "CLIENT_ADMIN");
  } catch {
    return { ok: false, error: "Only an admin can manage billing." };
  }
  if (!(await isBillingConfigured())) return { ok: false, error: "Billing isn't enabled yet." };

  const org = await prisma.org.findUniqueOrThrow({ where: { id: ctx.orgId }, select: { stripeCustomerId: true } });
  if (!org.stripeCustomerId) return { ok: false, error: "No billing account yet — subscribe first." };

  try {
    const url = await createPortalSession({ customerId: org.stripeCustomerId, returnUrl: `${baseUrl()}/account` });
    return { ok: true, url };
  } catch (err) {
    console.error("portal failed:", err);
    return { ok: false, error: "Couldn't open the billing portal — try again." };
  }
}
