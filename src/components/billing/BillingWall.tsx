"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  startCheckoutAction,
  startOneTimeCheckoutAction,
  startPerformanceCheckoutAction,
  subscriptionStatusAction,
  type BillingActionResult,
} from "@/server/actions/billing";
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
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showOptions, setShowOptions] = useState(false);
  const [bump, setBump] = useState(false);

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

  // Run a checkout action (keyed so only the clicked button shows a spinner) and
  // redirect to the returned Stripe URL.
  async function go(key: string, action: () => Promise<BillingActionResult>) {
    setError(null);
    setPending(key);
    try {
      const r = await action();
      if (r.ok && r.url) {
        window.location.href = r.url;
        return;
      }
      setError(r.error ?? "Couldn't start checkout.");
    } catch {
      setError("Couldn't start checkout — try again.");
    }
    setPending(null);
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
        <>
          <button
            onClick={() => go("trial", startCheckoutAction)}
            disabled={pending !== null}
            className="w-full rounded-lg bg-sweep px-4 py-3 font-heading text-[14px] font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {pending === "trial" ? <SpinnerLabel>Starting…</SpinnerLabel> : "Start free — pay only when it books calls"}
          </button>

          <button
            type="button"
            onClick={() => setShowOptions((v) => !v)}
            className="mt-3 w-full text-[12.5px] font-semibold text-muted hover:text-ink"
          >
            {showOptions ? "Hide other ways to start" : "Prefer to pay once, or per booked call?"}
          </button>

          {showOptions && (
            <div className="mt-3 space-y-2.5 rounded-xl border border-line-2 bg-cream px-3.5 py-3.5">
              {/* Founding $27 + optional backlog bump */}
              <div className="rounded-lg border border-line-2 bg-white px-3.5 py-3">
                <div className="flex items-baseline justify-between">
                  <span className="font-heading text-[13.5px] font-semibold text-ink">Founding — your first 100 leads</span>
                  <span className="text-[13px] font-bold text-ink">$27 once</span>
                </div>
                <label className="mt-2 flex cursor-pointer items-center gap-2 text-[12px] text-muted">
                  <input type="checkbox" checked={bump} onChange={(e) => setBump(e.target.checked)} className="h-3.5 w-3.5 accent-sweep" />
                  Recover the whole backlog — up to 500 leads <span className="font-semibold text-ink">(+$17)</span>
                </label>
                <button
                  onClick={() => go("front", () => startOneTimeCheckoutAction({ tier: "FRONT_END", bump }))}
                  disabled={pending !== null}
                  className="mt-2.5 w-full rounded-lg border border-sweep px-3 py-2 font-heading text-[12.5px] font-semibold text-sweep hover:bg-sweep hover:text-white disabled:opacity-60"
                >
                  {pending === "front" ? <SpinnerLabel>Starting…</SpinnerLabel> : `Get Founding — $${bump ? "44" : "27"}`}
                </button>
              </div>

              {/* Own-It $197 */}
              <div className="flex items-center justify-between rounded-lg border border-line-2 bg-white px-3.5 py-3">
                <div>
                  <div className="font-heading text-[13.5px] font-semibold text-ink">Own it outright</div>
                  <div className="text-[12px] text-muted">Unlimited lists, yours for life</div>
                </div>
                <button
                  onClick={() => go("oto1", () => startOneTimeCheckoutAction({ tier: "OTO1" }))}
                  disabled={pending !== null}
                  className="rounded-lg border border-line px-3 py-2 font-heading text-[12.5px] font-semibold text-ink hover:bg-ink hover:text-white disabled:opacity-60"
                >
                  {pending === "oto1" ? <SpinnerLabel>…</SpinnerLabel> : "$197 once"}
                </button>
              </div>

              {/* Performance $97/mo + per call */}
              <div className="flex items-center justify-between rounded-lg border border-line-2 bg-white px-3.5 py-3">
                <div>
                  <div className="font-heading text-[13.5px] font-semibold text-ink">Pay as it performs</div>
                  <div className="text-[12px] text-muted">$97/mo + a flat fee per booked call</div>
                </div>
                <button
                  onClick={() => go("perf", startPerformanceCheckoutAction)}
                  disabled={pending !== null}
                  className="rounded-lg border border-line px-3 py-2 font-heading text-[12.5px] font-semibold text-ink hover:bg-ink hover:text-white disabled:opacity-60"
                >
                  {pending === "perf" ? <SpinnerLabel>…</SpinnerLabel> : "Choose"}
                </button>
              </div>
            </div>
          )}
        </>
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
