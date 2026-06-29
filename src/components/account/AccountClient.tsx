"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelSubscriptionAction, reactivateSubscriptionAction } from "@/server/actions/account";
import { toastResult } from "@/components/ui/Toast";

/**
 * §9 self-serve account controls. Cancellation is one click, with a single plain
 * confirm step (not a retention maze) — and reactivation is one click back. We
 * say plainly what happens to sending and data. Frictionless cancellation is a
 * trust signal and it reduces disputes.
 */
export function AccountClient({
  orgName,
  billingStatus,
  canceled,
  stripeManaged = false,
}: {
  orgName: string;
  billingStatus: string;
  canceled: boolean;
  stripeManaged?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  function run(fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) {
    startTransition(async () => {
      toastResult(await fn());
      setConfirming(false);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl2 border border-line bg-white p-6">
        <p className="m-0 mb-1 text-[12px] font-semibold uppercase tracking-[1.6px] text-muted-2">Workspace</p>
        <p className="m-0 font-heading text-[20px] font-semibold text-ink">{orgName}</p>
        <p className="m-0 mt-1 text-[13.5px] text-muted">
          Subscription:{" "}
          <span className={`font-semibold ${canceled ? "text-[#b43c3c]" : "text-sweep"}`}>
            {canceled ? "Canceled" : billingStatus === "trial" ? "Trial" : "Active"}
          </span>
        </p>
      </div>

      {/* When Stripe manages billing, the portal (BillingSection) handles
          cancel/reactivate — hide the manual self-serve controls. */}
      {stripeManaged ? null : canceled ? (
        <div className="rounded-xl2 border border-line bg-white p-6">
          <p className="m-0 mb-1.5 font-heading text-[16px] font-semibold text-ink">Reactivate your workspace</p>
          <p className="m-0 mb-4 max-w-[520px] text-[13.5px] leading-[1.55] text-muted">
            Sending is off and nothing has been deleted — your leads, voice profile, and history are all here. Turn it
            back on whenever you&apos;re ready.
          </p>
          <button
            disabled={pending}
            onClick={() => run(reactivateSubscriptionAction)}
            className="rounded-lg bg-sweep px-5 py-3 font-heading text-[14px] font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {pending ? "Reactivating…" : "Reactivate — one click"}
          </button>
        </div>
      ) : (
        <div className="rounded-xl2 border border-line bg-white p-6">
          <p className="m-0 mb-1.5 font-heading text-[16px] font-semibold text-ink">Cancel subscription</p>
          <p className="m-0 mb-4 max-w-[520px] text-[13.5px] leading-[1.55] text-muted">
            Cancel anytime, in one click. Sending stops immediately, your data is kept and stays exportable, and you can
            come back whenever you like. No phone call, no forms.
          </p>

          {confirming ? (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[#f0dcc9] bg-[#FBF3EC] p-4">
              <p className="m-0 flex-1 text-[13.5px] text-[#7a5a44]">
                Cancel now? The agent will stop emailing your leads immediately.
              </p>
              <button
                disabled={pending}
                onClick={() => run(cancelSubscriptionAction)}
                className="rounded-lg bg-[#b43c3c] px-4 py-2.5 text-[13.5px] font-semibold text-white hover:opacity-90 disabled:opacity-60"
              >
                {pending ? "Canceling…" : "Yes, cancel"}
              </button>
              <button onClick={() => setConfirming(false)} className="rounded-lg border border-line-3 bg-white px-4 py-2.5 text-[13.5px] font-semibold text-muted hover:bg-cream">
                Keep it
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              className="rounded-lg border border-line-3 bg-white px-5 py-3 text-[14px] font-semibold text-muted hover:bg-cream"
            >
              Cancel subscription
            </button>
          )}
        </div>
      )}
    </div>
  );
}
