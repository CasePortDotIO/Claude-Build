import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyWebhook, meteredPriceId } from "@/lib/billing/stripe";
import { tierForPrice } from "@/lib/billing/entitle";
import { grantOneTimeTier } from "@/lib/billing/grant";
import { ensureGuaranteeWindow } from "@/lib/guarantee";
import { getSecret } from "@/lib/config/secrets";
import { reportError } from "@/lib/observability/report";

/**
 * Stripe webhook — keeps Org.billingStatus + subscription fields in sync with the
 * real subscription. Signature-verified against the raw body. Returns 200 on
 * anything we don't handle so Stripe doesn't retry needlessly.
 */
export const dynamic = "force-dynamic";

function mapStatus(s: string): string {
  switch (s) {
    case "active": return "active";
    case "trialing": return "trial";
    case "past_due": case "unpaid": return "past_due";
    case "canceled": case "incomplete_expired": return "canceled";
    default: return "paused";
  }
}

// Result-gated $0 trial: the agent must book this many calls before we charge.
const TRIAL_CALL_THRESHOLD = 3;

async function orgIdFor(sub: { customer?: string; metadata?: { orgId?: string } }): Promise<string | null> {
  if (sub.metadata?.orgId) return sub.metadata.orgId;
  if (sub.customer) {
    const org = await prisma.org.findFirst({ where: { stripeCustomerId: sub.customer }, select: { id: true } });
    return org?.id ?? null;
  }
  return null;
}

export async function POST(req: NextRequest) {
  const secret = await getSecret("STRIPE_WEBHOOK_SECRET");
  if (!secret) return NextResponse.json({ ok: false, error: "webhook not configured" }, { status: 503 });

  const raw = await req.text();
  if (!verifyWebhook(raw, req.headers.get("stripe-signature"), secret)) {
    return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 400 });
  }

  let event: { type: string; data: { object: Record<string, unknown> } };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  try {
    const obj = event.data.object as Record<string, unknown>;
    if (event.type === "checkout.session.completed") {
      const orgId = (obj.client_reference_id as string) || (obj.metadata as { orgId?: string })?.orgId || null;
      const customer = obj.customer as string | undefined;
      const subscription = obj.subscription as string | undefined;
      const mode = obj.mode as string | undefined;
      const meta = (obj.metadata as { tier?: string; bump?: string }) ?? {};
      if (orgId && mode === "payment" && (meta.tier === "FRONT_END" || meta.tier === "OTO1")) {
        // One-time purchase (Founding $27 / +$17 bump, Own-It $197): no
        // subscription — grant the tier + lifetime access + its guarantee.
        await grantOneTimeTier({ orgId, tier: meta.tier, bump: meta.bump === "1", customerId: customer });
      } else if (orgId) {
        // Subscription checkout. Don't clobber a result-gated trial: the
        // subscription.created event (status "trialing") is the source of truth
        // for billingStatus. Here we only attach the customer/subscription ids and
        // grant access if this checkout wasn't a trial ("trial" grants access too).
        const existing = await prisma.org.findUnique({ where: { id: orgId }, select: { billingStatus: true } });
        const keepTrial = existing?.billingStatus === "trial";
        await prisma.org.update({
          where: { id: orgId },
          data: {
            ...(keepTrial ? {} : { billingStatus: "active" }),
            canceledAt: null,
            ...(customer ? { stripeCustomerId: customer } : {}),
            ...(subscription ? { stripeSubscriptionId: subscription } : {}),
          },
        });
      }
    } else if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.created") {
      const sub = obj as { id?: string; status?: string; customer?: string; metadata?: { orgId?: string }; current_period_end?: number; items?: { data?: { id?: string; price?: { id?: string; unit_amount?: number } }[] } };
      const orgId = await orgIdFor(sub);
      if (orgId) {
        const status = mapStatus(sub.status ?? "");
        const price = sub.items?.data?.[0]?.price;
        const priceId = price?.id;
        // Map the purchased price → the tier it unlocks (the Entitlement Matrix
        // key). Unknown price → null, and we leave planTier untouched so
        // resolveTier derives it from billing state (the legacy single plan).
        const mappedTier = await tierForPrice(priceId);
        // On a trialing subscription, stamp the result-gated trial contract:
        // which plan it converts to, and how many booked calls end the trial.
        // trialStartedAt is only set once (the first time we see it trialing).
        let tierFields: Record<string, unknown> = {};
        if (status === "trial") {
          const org = await prisma.org.findUnique({ where: { id: orgId }, select: { trialStartedAt: true } });
          tierFields = {
            planTier: mappedTier ?? "CONTINUITY",
            trialCallThreshold: TRIAL_CALL_THRESHOLD,
            ...(org?.trialStartedAt ? {} : { trialStartedAt: new Date() }),
          };
        } else if (mappedTier) {
          tierFields = { planTier: mappedTier };
        }
        // Triple-Lock leg 3: lock the price for life on the first paid activation.
        if (status === "active" && typeof price?.unit_amount === "number") {
          const cur = await prisma.org.findUnique({ where: { id: orgId }, select: { rateLockedCents: true } });
          if (cur && cur.rateLockedCents == null) tierFields = { ...tierFields, rateLockedCents: price.unit_amount };
        }
        // Performance plan: remember the metered subscription item so each booked
        // call can report one usage unit against it.
        const metered = await meteredPriceId();
        if (metered) {
          const meteredItem = sub.items?.data?.find((it) => it.price?.id === metered)?.id;
          if (meteredItem) tierFields = { ...tierFields, meteredSubscriptionItemId: meteredItem };
        }
        await prisma.org.update({
          where: { id: orgId },
          data: {
            billingStatus: status,
            stripeSubscriptionId: sub.id,
            stripePriceId: priceId,
            currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000) : undefined,
            canceledAt: status === "canceled" ? new Date() : null,
            ...tierFields,
          },
        });
        // Open the booked-call guarantee window once they're a paying customer.
        if (status === "active") await ensureGuaranteeWindow(orgId).catch(() => {});
      }
    } else if (event.type === "customer.subscription.deleted") {
      const orgId = await orgIdFor(obj as { customer?: string; metadata?: { orgId?: string } });
      if (orgId) {
        await prisma.org.update({ where: { id: orgId }, data: { billingStatus: "canceled", canceledAt: new Date(), stripeSubscriptionId: null } });
      }
    }
  } catch (err) {
    // A billing-sync failure is high-signal (a paid customer may not get access)
    // — surface it to Sentry. Still 200 so Stripe doesn't hammer retries.
    reportError(err, { source: "stripe-webhook", eventType: event.type });
  }

  return NextResponse.json({ received: true });
}
