import Link from "next/link";

/**
 * Sticky top bar: page title + the agent status pill + "New sweep" CTA.
 * In M1 the pill is a static "Active" indicator; pause/resume control arrives
 * with the agent loop in M3. "New sweep" routes to the CSV import flow.
 */
export function Topbar({ title }: { title: string }) {
  return (
    <header className="sticky top-0 z-40 flex h-[66px] items-center justify-between gap-5 border-b border-[#e7e1d6] bg-[rgba(250,247,242,0.86)] px-[34px] backdrop-blur-md">
      <h1 className="m-0 font-heading text-[20px] font-semibold tracking-[-0.3px] text-ink">{title}</h1>
      <div className="flex items-center gap-3.5">
        <span className="flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-[12.5px]">
          <span className="inline-block h-2 w-2 animate-wsPulse rounded-full bg-sweep" />
          <span className="font-semibold text-sweep">Active</span>
          <span className="text-[#888780]">v1 · preview &amp; approve</span>
        </span>
        <Link
          href="/leads/import"
          className="flex items-center gap-2 rounded-lg bg-ember px-4 py-2.5 font-heading text-[13.5px] font-semibold text-white hover:bg-ember-hover"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          New sweep
        </Link>
      </div>
    </header>
  );
}
