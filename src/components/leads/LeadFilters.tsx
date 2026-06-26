"use client";

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

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value && value !== "all") next.set(key, value);
    else next.delete(key);
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="mb-5 flex flex-wrap items-center gap-2.5">
      {FILTERS.map((f) => {
        const on = active === f.key || (f.key === "all" && active === "all");
        return (
          <button
            key={f.key}
            onClick={() => setParam("status", f.key)}
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
      <input
        defaultValue={query}
        placeholder="Search name, email, company…"
        onKeyDown={(e) => {
          if (e.key === "Enter") setParam("q", (e.target as HTMLInputElement).value);
        }}
        className="ml-auto w-[260px] rounded-lg border border-line-3 bg-white px-3.5 py-2 text-[13.5px] outline-none focus:border-sweep focus:ring-2 focus:ring-[rgba(27,122,87,0.12)]"
      />
    </div>
  );
}
