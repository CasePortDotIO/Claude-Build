import { createHmac, timingSafeEqual } from "node:crypto";
import { getSecret } from "@/lib/config/secrets";

/**
 * Stripe via REST (no SDK dependency) — checkout, billing portal, customer
 * creation, and webhook signature verification. Credentials resolve from the
 * in-app store (Settings → Integrations) or env; when unset the billing UI shows
 * "not enabled" and the product runs unchanged.
 */
const API = "https://api.stripe.com/v1";

/**
 * Billing statuses that grant access to the app (paid-only launch). Anything
 * else (incomplete / past_due / paused / canceled) is walled behind /billing
 * when billing is configured.
 */
export const ACTIVE_BILLING_STATUSES = ["active", "trial"] as const;

export function subscriptionActive(status: string | null | undefined): boolean {
  return ACTIVE_BILLING_STATUSES.includes((status ?? "") as (typeof ACTIVE_BILLING_STATUSES)[number]);
}

export async function isBillingConfigured(): Promise<boolean> {
  return Boolean((await getSecret("STRIPE_SECRET_KEY")) && (await getSecret("STRIPE_PRICE_ID")));
}

export async function planDisplay(): Promise<{ name: string; price: string }> {
  return {
    name: (await getSecret("STRIPE_PLAN_NAME")) || "The Warm Sweep",
    price: (await getSecret("STRIPE_PLAN_PRICE_LABEL")) || "",
  };
}

async function key(): Promise<string> {
  const k = await getSecret("STRIPE_SECRET_KEY");
  if (!k) throw new Error("Stripe is not connected.");
  return k;
}

// Stripe expects application/x-www-form-urlencoded with bracket notation for
// nested params (e.g. line_items[0][price]).
function form(params: Record<string, string | number | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) p.append(k, String(v));
  return p.toString();
}

async function stripePost<T>(path: string, body: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await key()}`, "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json();
  if (!res.ok) {
    const msg = (data as { error?: { message?: string } })?.error?.message ?? `Stripe ${res.status}`;
    throw new Error(msg);
  }
  return data as T;
}

export async function createCustomer(opts: { email?: string; name?: string; orgId: string }): Promise<string> {
  const c = await stripePost<{ id: string }>("/customers", form({
    email: opts.email,
    name: opts.name,
    "metadata[orgId]": opts.orgId,
  }));
  return c.id;
}

// Trial length cap for the result-gated $0 trial. The trial ends the moment the
// agent books the Nth call; this is just the safety backstop if it never does
// (so "pay nothing until it books N calls" stays literally true up to a year).
const TRIAL_BACKSTOP_DAYS = 365;

export async function createCheckoutSession(opts: {
  customerId: string;
  orgId: string;
  successUrl: string;
  cancelUrl: string;
  // Result-gated $0 trial: collect the card now, but bill $0 until we end the
  // trial early on the Nth booked call.
  trial?: boolean;
}): Promise<string> {
  const fields: Record<string, string | number | undefined> = {
    mode: "subscription",
    customer: opts.customerId,
    "line_items[0][price]": await getSecret("STRIPE_PRICE_ID"),
    "line_items[0][quantity]": 1,
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    client_reference_id: opts.orgId,
    "subscription_data[metadata][orgId]": opts.orgId,
    allow_promotion_codes: "true",
  };
  if (opts.trial) {
    fields["subscription_data[trial_period_days]"] = TRIAL_BACKSTOP_DAYS;
    // Require a card even though $0 is due now, so ending the trial can charge.
    fields["payment_method_collection"] = "always";
  }
  const s = await stripePost<{ url: string }>("/checkout/sessions", form(fields));
  return s.url;
}

/**
 * End a subscription's trial immediately — Stripe charges the card on file right
 * away and moves the subscription to active. Called when the agent books the Nth
 * call, converting the result-gated $0 trial into paid.
 */
export async function endTrialNow(subscriptionId: string): Promise<void> {
  await stripePost(`/subscriptions/${subscriptionId}`, form({ trial_end: "now", proration_behavior: "none" }));
}

/** The one-time tiers the app sells and the price-id secret each maps to. */
const ONE_TIME_PRICE_KEY: Record<"FRONT_END" | "OTO1", string> = {
  FRONT_END: "STRIPE_PRICE_FRONT_END",
  OTO1: "STRIPE_PRICE_OTO1",
};

/**
 * One-time purchase checkout (mode=payment) — the $27 Founding tripwire (with the
 * optional +$17 backlog bump) and the $197 Own-It license. No subscription is
 * created; the webhook grants the tier on payment. The tier + bump ride in
 * session metadata so the webhook grants entitlement without fetching line items.
 */
export async function createOneTimeCheckout(opts: {
  customerId: string;
  orgId: string;
  tier: "FRONT_END" | "OTO1";
  bump?: boolean; // FRONT_END only: adds the +$17 backlog unlock (cap 100→500)
  successUrl: string;
  cancelUrl: string;
}): Promise<string> {
  const price = await getSecret(ONE_TIME_PRICE_KEY[opts.tier]);
  if (!price) throw new Error("That plan isn't available for purchase yet.");
  const bump = Boolean(opts.bump) && opts.tier === "FRONT_END";
  const bumpPrice = bump ? await getSecret("STRIPE_PRICE_BUMP") : undefined;

  const fields: Record<string, string | number | undefined> = {
    mode: "payment",
    customer: opts.customerId,
    "line_items[0][price]": price,
    "line_items[0][quantity]": 1,
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    client_reference_id: opts.orgId,
    "metadata[orgId]": opts.orgId,
    "metadata[tier]": opts.tier,
    "metadata[bump]": bump && bumpPrice ? "1" : "0",
    "payment_intent_data[metadata][orgId]": opts.orgId,
    allow_promotion_codes: "true",
  };
  if (bump && bumpPrice) {
    fields["line_items[1][price]"] = bumpPrice;
    fields["line_items[1][quantity]"] = 1;
  }
  const s = await stripePost<{ url: string }>("/checkout/sessions", form(fields));
  return s.url;
}

/**
 * Performance plan checkout ($97/mo base + a metered fee per booked call). A
 * subscription with two items: a licensed base price and a metered usage price.
 * The webhook stores the metered item id; bookCall reports one unit per call.
 */
export async function createMeteredCheckout(opts: {
  customerId: string;
  orgId: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<string> {
  const base = await getSecret("STRIPE_PRICE_PERFORMANCE_BASE");
  const metered = await getSecret("STRIPE_PRICE_PERFORMANCE_METERED");
  if (!base || !metered) throw new Error("The performance plan isn't available yet.");
  const s = await stripePost<{ url: string }>("/checkout/sessions", form({
    mode: "subscription",
    customer: opts.customerId,
    "line_items[0][price]": base,
    "line_items[0][quantity]": 1,
    // A metered item takes no quantity — usage is reported per booked call.
    "line_items[1][price]": metered,
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    client_reference_id: opts.orgId,
    "subscription_data[metadata][orgId]": opts.orgId,
    allow_promotion_codes: "true",
  }));
  return s.url;
}

/**
 * Report one booked call against a metered subscription item (Performance plan).
 * Best-effort: a booking is the billable event, and the caller swallows failures
 * so billing never blocks a booking.
 */
export async function reportBookingUsage(subscriptionItemId: string): Promise<void> {
  await stripePost(`/subscription_items/${subscriptionItemId}/usage_records`, form({ quantity: 1, action: "increment" }));
}

/** The metered price id — used to spot the metered item on a Performance sub. */
export async function meteredPriceId(): Promise<string | undefined> {
  return getSecret("STRIPE_PRICE_PERFORMANCE_METERED");
}

export async function createPortalSession(opts: { customerId: string; returnUrl: string }): Promise<string> {
  const s = await stripePost<{ url: string }>("/billing_portal/sessions", form({
    customer: opts.customerId,
    return_url: opts.returnUrl,
  }));
  return s.url;
}

/**
 * Verify a Stripe webhook signature (the `Stripe-Signature` header) against the
 * raw request body, with a 5-minute tolerance. Mirrors Stripe's scheme so we
 * don't need the SDK.
 */
export function verifyWebhook(rawBody: string, sigHeader: string | null, secret: string): boolean {
  if (!sigHeader) return false;
  const parts: Record<string, string> = {};
  for (const kv of sigHeader.split(",")) {
    const [k, v] = kv.split("=");
    if (k && v) parts[k.trim()] = v.trim();
  }
  const t = parts["t"];
  const v1 = parts["v1"];
  if (!t || !v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false; // replay window
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  const a = Buffer.from(v1);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
