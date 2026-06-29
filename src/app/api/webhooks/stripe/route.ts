import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyWebhook } from "@/lib/billing/stripe";
import { getSecret } from "@/lib/config/secrets";

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
      if (orgId) {
        await prisma.org.update({
          where: { id: orgId },
          data: { billingStatus: "active", canceledAt: null, ...(customer ? { stripeCustomerId: customer } : {}), ...(subscription ? { stripeSubscriptionId: subscription } : {}) },
        });
      }
    } else if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.created") {
      const sub = obj as { id?: string; status?: string; customer?: string; metadata?: { orgId?: string }; current_period_end?: number; items?: { data?: { price?: { id?: string } }[] } };
      const orgId = await orgIdFor(sub);
      if (orgId) {
        const status = mapStatus(sub.status ?? "");
        await prisma.org.update({
          where: { id: orgId },
          data: {
            billingStatus: status,
            stripeSubscriptionId: sub.id,
            stripePriceId: sub.items?.data?.[0]?.price?.id,
            currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000) : undefined,
            canceledAt: status === "canceled" ? new Date() : null,
          },
        });
      }
    } else if (event.type === "customer.subscription.deleted") {
      const orgId = await orgIdFor(obj as { customer?: string; metadata?: { orgId?: string } });
      if (orgId) {
        await prisma.org.update({ where: { id: orgId }, data: { billingStatus: "canceled", canceledAt: new Date(), stripeSubscriptionId: null } });
      }
    }
  } catch (err) {
    console.error("[stripe webhook] handler error:", err);
    // Still 200 so Stripe doesn't hammer retries on a transient DB blip.
  }

  return NextResponse.json({ received: true });
}
