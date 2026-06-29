"use client";

import { useTransition } from "react";
import { startCheckoutAction, openBillingPortalAction } from "@/server/actions/billing";
import { toast } from "@/components/ui/Toast";
import { SpinnerLabel } from "@/components/ui/Spinner";

/**
 * Stripe billing UI. Only rendered when billing is configured. Subscribe →
 * Checkout; once subscribed → the Stripe customer portal (manage card, cancel,
 * invoices). Redirects to the Stripe-hosted URL the server action returns.
 */
export function BillingSection({
  hasSubscription,
  billingStatus,
  planName,
  priceLabel,
  renewsOn,
  isAdmin,
}: {
  hasSubscription: boolean;
  billingStatus: string;
  planName: string;
  priceLabel: string;
  renewsOn: string | null;
  isAdmin: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function go(fn: () => Promise<{ ok: boolean; url?: string; error?: string }>) {
    startTransition(async () => {
      const r = await fn();
      if (r.ok && r.url) window.location.href = r.url;
      else toast(r.error ?? "Something went wrong.", "error");
    });
  }

  const active = hasSubscription && billingStatus !== "canceled";

  return (
    <div className="mt-6 rounded-xl2 border border-line bg-white p-6 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="m-0 mb-1 font-heading text-[16px] font-semibold text-ink">Plan &amp; billing</p>
          <p className="m-0 text-[13px] text-muted">
            {active ? (
              <>
                <span className="font-semibold text-ink">{planName}</span>
                {priceLabel ? ` · ${priceLabel}` : ""}
                {renewsOn ? ` · renews ${renewsOn}` : ""}
                {" · "}
                <span className={billingStatus === "past_due" ? "font-semibold text-ember" : "font-semibold text-sweep"}>
                  {billingStatus === "past_due" ? "Payment past due" : billingStatus === "trial" ? "Trial" : "Active"}
                </span>
              </>
            ) : (
              <>Subscribe to {planName}{priceLabel ? ` (${priceLabel})` : ""} to turn on sending and autopilot.</>
            )}
          </p>
        </div>
        {isAdmin && (
          active ? (
            <button
              onClick={() => go(openBillingPortalAction)}
              disabled={pending}
              className="rounded-lg border border-line-3 bg-white px-4 py-2.5 text-[13.5px] font-semibold text-muted hover:bg-cream disabled:opacity-60"
            >
              {pending ? <SpinnerLabel>Opening…</SpinnerLabel> : "Manage billing"}
            </button>
          ) : (
            <button
              onClick={() => go(startCheckoutAction)}
              disabled={pending}
              className="rounded-lg bg-sweep px-5 py-2.5 font-heading text-[13.5px] font-semibold text-white hover:opacity-90 disabled:opacity-60"
            >
              {pending ? <SpinnerLabel>Starting…</SpinnerLabel> : "Subscribe"}
            </button>
          )
        )}
      </div>
    </div>
  );
}
