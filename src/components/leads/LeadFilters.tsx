"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

const FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "NEW", label: "New" },
  { key: "AWAITING_APPROVAL", label: "Awaiting approval" },
  { key: "REPLIED", label: "Replied" },
  { key: "BOOKED", label: "Booked" },
  { key: "OPTED_OUT", label: "Opted out" },
];

export function LeadFilters({ active, query }: { active: string; query: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(query);
  const firstRun = useRef(true);

  function pushParams(mut: (p: URLSearchParams) => void) {
    const next = new URLSearchParams(params.toString());
    mut(next);
    router.push(`${pathname}?${next.toString()}`);
  }

  function setStatus(value: string) {
    pushParams((p) => (value && value !== "all" ? p.set("status", value) : p.delete("status")));
  }

  // Live search — debounced so it filters as you type, no Enter required.
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    const t = setTimeout(() => {
      pushParams((p) => (q.trim() ? p.set("q", q.trim()) : p.delete("q")));
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="mb-5 flex flex-wrap items-center gap-2.5">
      {FILTERS.map((f) => {
        const on = active === f.key || (f.key === "all" && active === "all");
        return (
          <button
            key={f.key}
            onClick={() => setStatus(f.key)}
            className={`rounded-lg border px-3.5 py-2 text-[13px] font-medium transition-colors ${
              on
                ? "border-sweep bg-sweep text-white"
                : "border-line bg-white text-muted hover:border-[#d8d3c8]"
            }`}
          >
            {f.label}
          </button>
        );
      })}
      <div className="relative ml-auto w-[260px]">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#a3a299" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
          <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
        </svg>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, email, company…"
          className="w-full rounded-lg border border-line-3 bg-white py-2 pl-9 pr-8 text-[13.5px] outline-none focus:border-sweep focus:ring-2 focus:ring-[rgba(27,122,87,0.12)]"
        />
        {q && (
          <button
            onClick={() => setQ("")}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-3 hover:text-muted"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        )}
      </div>
    </div>
  );
}
