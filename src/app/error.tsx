"use client";

import { useEffect } from "react";
import Link from "next/link";
import { reportError } from "@/lib/observability/report";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportError(error, { digest: error.digest, boundary: "route" });
  }, [error]);

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-6">
      <div className="ws-rise max-w-[420px] rounded-xl2 border border-line bg-white p-8 text-center shadow-card">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#fbf0ec] text-[#b43c3c]">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01" /></svg>
        </div>
        <h1 className="m-0 mb-1.5 font-heading text-[19px] font-semibold text-ink">Something went wrong</h1>
        <p className="m-0 mb-5 text-[13.5px] leading-[1.55] text-muted">
          A hiccup on our end — not your data. Try again, and if it keeps happening we&apos;re already looking into it.
        </p>
        <div className="flex justify-center gap-2.5">
          <button onClick={reset} className="rounded-lg bg-sweep px-4 py-2.5 text-[13.5px] font-semibold text-white hover:opacity-90">Try again</button>
          <Link href="/" className="rounded-lg border border-line-3 bg-white px-4 py-2.5 text-[13.5px] font-semibold text-muted hover:bg-cream">Go to dashboard</Link>
        </div>
      </div>
    </div>
  );
}
