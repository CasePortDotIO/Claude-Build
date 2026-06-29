"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { loadSampleDataAction } from "@/server/actions/sample";
import { toastResult } from "@/components/ui/Toast";

/**
 * Shown on an empty workspace (no real leads, no samples) — lets the operator
 * populate the whole app with one click to explore, without having to import a
 * real CSV first. Complements the FirstRunGuide rather than replacing it.
 */
export function LoadSampleDataPrompt() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function load() {
    startTransition(async () => {
      toastResult(await loadSampleDataAction(), "Sample data loaded");
      router.refresh();
    });
  }

  return (
    <div className="mb-[22px] flex flex-col gap-3 rounded-xl2 border border-line bg-white p-4 shadow-card sm:flex-row sm:items-center">
      <div className="flex flex-1 items-start gap-3">
        <span className="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-full bg-sweep-mist text-[15px]" aria-hidden>
          ✨
        </span>
        <div className="min-w-0">
          <p className="m-0 text-[13.5px] font-semibold text-ink">Want to see it in action first?</p>
          <p className="m-0 text-[12.5px] leading-[1.45] text-muted">
            Load a set of sample leads, drafts, a live reply, and a booked call — so you can try every screen before
            importing your own. Clear it anytime.
          </p>
        </div>
      </div>
      <button
        onClick={load}
        disabled={pending}
        className="flex-none self-start rounded-lg border border-line-3 bg-white px-3.5 py-2 text-[12.5px] font-semibold text-ink hover:bg-cream disabled:opacity-60 sm:self-center"
      >
        {pending ? "Loading…" : "Load sample data"}
      </button>
    </div>
  );
}
