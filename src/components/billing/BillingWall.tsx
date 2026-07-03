"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { startCheckoutAction, subscriptionStatusAction } from "@/server/actions/billing";
import { SpinnerLabel } from "@/components/ui/Spinner";

/**
 * Paid-only billing wall. Shown when a workspace has no active subscription.
 * Admins can subscribe (Stripe Checkout); after payment the webhook flips the
 * org to active, and the poll below advances the user into the app automatically.
 */
export function BillingWall({
  isAdmin,
  planName,
  priceLabel,
  orgName,
}: {
  isAdmin: boolean;
  planName: string;
  priceLabel: string;
  orgName: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-advance the moment the subscription goes active (handles the webhook
  // landing a few seconds after Stripe redirects back).
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const r = await subscriptionStatusAction();
        if (r.active) {
          clearInterval(id);
          router.replace("/");
          router.refresh();
        }
      } catch {
        /* keep polling */
      }
    }, 3000);
    return () => clearInterval(id);
  }, [router]);

  async function subscribe() {
    setError(null);
    setPending(true);
    try {
      const r = await startCheckoutAction();
      if (r.ok && r.url) {
        window.location.href = r.url;
        return;
      }
      setError(r.error ?? "Couldn't start checkout.");
    } catch {
      setError("Couldn't start checkout — try again.");
    }
    setPending(false);
  }

  return (
    <div className="w-full max-w-[440px] rounded-xl2 border border-line bg-white p-8 shadow-card">
      <div className="mb-5 flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-sweep font-heading text-[17px] font-bold text-white">◎</span>
        <span className="font-heading text-[15px] font-semibold text-ink">The Warm Sweep&trade;</span>
      </div>

      <h1 className="m-0 mb-2 font-heading text-[24px] font-semibold tracking-[-0.4px] text-ink">
        Activate {orgName}
      </h1>
      <p className="m-0 mb-6 text-[14px] leading-[1.6] text-muted">
        Turn on your workspace and let the agent go to work — drafting, sending, replies, and booked calls.
        You pay <span className="font-semibold text-ink">nothing until it books your first 3 calls</span>.
      </p>

      <div className="mb-6 rounded-xl border border-line-2 bg-cream-head px-4 py-3.5">
        <div className="flex items-baseline justify-between">
          <span className="font-heading text-[14.5px] font-semibold text-ink">{planName}</span>
          <span className="text-[15px] font-bold text-sweep">$0 today</span>
        </div>
        <p className="m-0 mt-1.5 text-[12.5px] leading-[1.5] text-muted">
          {priceLabel ? <>Then {priceLabel} once it has booked 3 calls for you. </> : <>Billed only after it has booked 3 calls for you. </>}
          Cancel anytime before then and you&apos;re never charged.
        </p>
      </div>

      {isAdmin ? (
        <button
          onClick={subscribe}
          disabled={pending}
          className="w-full rounded-lg bg-sweep px-4 py-3 font-heading text-[14px] font-semibold text-white hover:opacity-90 disabled:opacity-60"
        >
          {pending ? <SpinnerLabel>Starting…</SpinnerLabel> : "Start free — pay only when it books calls"}
        </button>
      ) : (
        <p className="m-0 rounded-lg border border-line-2 bg-cream px-4 py-3 text-[13px] text-muted">
          Ask a workspace admin to switch it on. You&apos;ll get access the moment they do — there&apos;s nothing to pay to start.
        </p>
      )}

      {error && <p className="m-0 mt-3 text-[13px] font-medium text-ember">{error}</p>}

      <div className="mt-6 flex items-center justify-between border-t border-line-2 pt-4 text-[12.5px]">
        <span className="text-muted-3">$0 today · secured by Stripe</span>
        <button onClick={() => signOut({ callbackUrl: "/sign-in" })} className="font-semibold text-muted hover:text-ink hover:underline">
          Sign out
        </button>
      </div>
    </div>
  );
}
