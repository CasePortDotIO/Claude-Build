"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { clearSampleDataAction } from "@/server/actions/sample";
import { toastResult } from "@/components/ui/Toast";
import { SpinnerLabel } from "@/components/ui/Spinner";

/**
 * Alive-from-zero onboarding banner. Shown while a workspace still has the
 * seeded sample data — it frames the demo content ("this is here so you can
 * explore") and gives the two next steps: import real leads, or clear the
 * samples. Disappears once cleared.
 */
export function SampleDataBanner() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function clear() {
    startTransition(async () => {
      toastResult(await clearSampleDataAction(), "Sample data cleared");
      router.refresh();
    });
  }

  return (
    <div className="mb-[22px] flex flex-col gap-3 rounded-xl2 border border-[rgba(27,122,87,0.22)] bg-sweep-mist p-4 shadow-card sm:flex-row sm:items-center">
      <div className="flex flex-1 items-start gap-3">
        <span className="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-full bg-sweep text-[15px]" aria-hidden>
          👋
        </span>
        <div className="min-w-0">
          <p className="m-0 text-[13.5px] font-semibold text-ink">You&apos;re looking at sample data.</p>
          <p className="m-0 text-[12.5px] leading-[1.45] text-muted">
            Four example leads, two drafts to approve, a live reply, and a booked call — so you can try every screen.
            When you&apos;re ready, import your own and clear these.
          </p>
        </div>
      </div>
      <div className="flex flex-none items-center gap-2 self-start sm:self-center">
        <Link
          href="/leads/import"
          className="rounded-lg bg-sweep px-3.5 py-2 text-[12.5px] font-semibold text-white hover:opacity-90"
        >
          Import my leads
        </Link>
        <button
          onClick={clear}
          disabled={pending}
          className="rounded-lg border border-line-3 bg-white px-3.5 py-2 text-[12.5px] font-semibold text-muted hover:bg-cream disabled:opacity-60"
        >
          {pending ? <SpinnerLabel>Clearing…</SpinnerLabel> : "Clear sample data"}
        </button>
      </div>
    </div>
  );
}
