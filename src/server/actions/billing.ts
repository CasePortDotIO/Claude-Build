"use server";

import { prisma } from "@/lib/prisma";
import { requireOrg, assertRole } from "@/lib/auth-helpers";
import { isBillingConfigured, createCustomer, createCheckoutSession, createOneTimeCheckout, createMeteredCheckout, createPortalSession, subscriptionActive } from "@/lib/billing/stripe";

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
      // Result-gated $0 trial: card collected now, $0 due today, charged only
      // once the agent books the threshold number of calls.
      trial: true,
    });
    return { ok: true, url };
  } catch (err) {
    console.error("checkout failed:", err);
    return { ok: false, error: "Couldn't start checkout — try again." };
  }
}

/** Resolve (or lazily create) the Stripe customer id for the active org. */
async function customerFor(ctx: { orgId: string; email: string }): Promise<string> {
  const org = await prisma.org.findUniqueOrThrow({
    where: { id: ctx.orgId },
    select: { name: true, brandName: true, stripeCustomerId: true },
  });
  if (org.stripeCustomerId) return org.stripeCustomerId;
  const customerId = await createCustomer({ email: ctx.email, name: org.brandName || org.name, orgId: ctx.orgId });
  await prisma.org.update({ where: { id: ctx.orgId }, data: { stripeCustomerId: customerId } });
  return customerId;
}

/**
 * Start a one-time purchase — Founding $27 (optionally + the $17 backlog bump) or
 * Own-It $197. Admin-only. The webhook grants the tier on payment.
 */
export async function startOneTimeCheckoutAction(opts: { tier: "FRONT_END" | "OTO1"; bump?: boolean }): Promise<BillingActionResult> {
  const ctx = await requireOrg();
  try {
    assertRole(ctx, "CLIENT_ADMIN");
  } catch {
    return { ok: false, error: "Only an admin can manage billing." };
  }
  if (!(await isBillingConfigured())) return { ok: false, error: "Billing isn't enabled yet." };

  try {
    const url = await createOneTimeCheckout({
      customerId: await customerFor(ctx),
      orgId: ctx.orgId,
      tier: opts.tier,
      bump: opts.bump,
      successUrl: `${baseUrl()}/account?checkout=success`,
      cancelUrl: `${baseUrl()}/billing?checkout=cancelled`,
    });
    return { ok: true, url };
  } catch (err) {
    console.error("one-time checkout failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't start checkout — try again." };
  }
}

/** Start the Performance plan ($97/mo + fee per booked call). Admin-only. */
export async function startPerformanceCheckoutAction(): Promise<BillingActionResult> {
  const ctx = await requireOrg();
  try {
    assertRole(ctx, "CLIENT_ADMIN");
  } catch {
    return { ok: false, error: "Only an admin can manage billing." };
  }
  if (!(await isBillingConfigured())) return { ok: false, error: "Billing isn't enabled yet." };

  try {
    const url = await createMeteredCheckout({
      customerId: await customerFor(ctx),
      orgId: ctx.orgId,
      successUrl: `${baseUrl()}/account?checkout=success`,
      cancelUrl: `${baseUrl()}/billing?checkout=cancelled`,
    });
    return { ok: true, url };
  } catch (err) {
    console.error("performance checkout failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't start checkout — try again." };
  }
}

/** Whether the active org currently has access (paid). Used by the billing wall to detect activation after checkout. */
export async function subscriptionStatusAction(): Promise<{ active: boolean }> {
  const ctx = await requireOrg();
  const org = await prisma.org.findUnique({ where: { id: ctx.orgId }, select: { billingStatus: true } });
  return { active: subscriptionActive(org?.billingStatus) };
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
