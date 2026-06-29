import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Stripe via REST (no SDK dependency) — checkout, billing portal, customer
 * creation, and webhook signature verification. Everything is gated on
 * STRIPE_SECRET_KEY + STRIPE_PRICE_ID; when unset the product runs exactly as
 * before and the billing UI shows "not enabled". Same safe-fallback pattern used
 * across the app.
 */
const API = "https://api.stripe.com/v1";

export function isBillingConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID);
}

export function planDisplay(): { name: string; price: string } {
  return {
    name: process.env.STRIPE_PLAN_NAME || "The Warm Sweep",
    price: process.env.STRIPE_PLAN_PRICE_LABEL || "",
  };
}

function key(): string {
  const k = process.env.STRIPE_SECRET_KEY;
  if (!k) throw new Error("STRIPE_SECRET_KEY is not set");
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
    headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/x-www-form-urlencoded" },
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

export async function createCheckoutSession(opts: {
  customerId: string;
  orgId: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<string> {
  const s = await stripePost<{ url: string }>("/checkout/sessions", form({
    mode: "subscription",
    customer: opts.customerId,
    "line_items[0][price]": process.env.STRIPE_PRICE_ID,
    "line_items[0][quantity]": 1,
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    client_reference_id: opts.orgId,
    "subscription_data[metadata][orgId]": opts.orgId,
    allow_promotion_codes: "true",
  }));
  return s.url;
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
