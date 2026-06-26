"use client";

import { useState } from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { LEAD_STATUS_META } from "@/lib/types";
import type { LeadStatus } from "@prisma/client";

// Serializable shape passed from the server page (no Date objects).
export interface LeadRow {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  status: LeadStatus;
  originalInquiry: string | null;
  statedGoal: string | null;
  toneRead: string | null;
  bestChannel: string | null;
  region: string | null;
  consentBasis: string;
  source: string | null;
  coldFor: string; // humanized "3w ago"
}

function fullName(l: LeadRow): string {
  const n = [l.firstName, l.lastName].filter(Boolean).join(" ").trim();
  return n || l.email;
}
function initials(l: LeadRow): string {
  const n = fullName(l);
  return n.includes("@")
    ? n.slice(0, 2).toUpperCase()
    : n.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

export function LeadsView({ leads }: { leads: LeadRow[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(leads[0]?.id ?? null);
  const selected = leads.find((l) => l.id === selectedId) ?? null;

  if (leads.length === 0) {
    return (
      <div className="rounded-xl2 border border-line bg-white p-12 text-center">
        <p className="m-0 mb-2 font-heading text-[18px] font-semibold text-ink">No leads yet</p>
        <p className="m-0 text-[14px] text-muted">
          Import a CSV of prior contacts to start your first sweep.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 items-start gap-[18px] lg:grid-cols-[1.5fr_1fr]">
      {/* table */}
      <div className="overflow-hidden rounded-xl2 border border-line bg-white">
        <div className="grid grid-cols-[1.6fr_0.9fr_1fr] gap-3 border-b border-line-2 bg-cream-head px-[22px] py-3.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.8px] text-muted-3">Contact</span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.8px] text-muted-3">Basis</span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.8px] text-muted-3">Status</span>
        </div>
        {leads.map((l) => {
          const on = l.id === selectedId;
          return (
            <button
              key={l.id}
              onClick={() => setSelectedId(l.id)}
              className={`grid w-full grid-cols-[1.6fr_0.9fr_1fr] items-center gap-3 border-b border-line-2 px-[22px] py-3.5 text-left last:border-b-0 transition-colors ${
                on ? "bg-cream" : "hover:bg-cream-head"
              }`}
            >
              <div className="min-w-0">
                <p className="m-0 mb-0.5 truncate text-[14.5px] font-semibold text-ink">{fullName(l)}</p>
                <p className="m-0 truncate text-[12px] text-muted-3">cold {l.coldFor}</p>
              </div>
              <span className="truncate text-[12px] text-muted">{l.consentBasis.replace(/_/g, " ").toLowerCase()}</span>
              <div><StatusBadge status={l.status} /></div>
            </button>
          );
        })}
      </div>

      {/* understanding drawer */}
      <div className="sticky top-[90px] rounded-xl2 bg-charcoal p-[26px]">
        {selected ? (
          <>
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-[46px] w-[46px] flex-none items-center justify-center rounded-full bg-avatar font-heading text-[17px] font-semibold text-white">
                {initials(selected)}
              </div>
              <div className="min-w-0">
                <p className="m-0 truncate font-heading text-[17px] font-semibold text-white">{fullName(selected)}</p>
                <p className="m-0 truncate text-[12.5px] text-on-dark-mute">{selected.email}</p>
              </div>
            </div>

            <p className="m-0 mb-3 text-[11px] font-semibold uppercase tracking-[1.6px] text-sweep-light">
              What the agent understands
            </p>
            <div className="mb-5 flex flex-col gap-[13px]">
              <Field label="Originally inquired about" value={selected.originalInquiry} empty="Not captured yet — the agent fills this in M2." />
              <Field label="Their stated goal" value={selected.statedGoal} empty="Inferred during research (M2)." />
              <div className="flex gap-5">
                <Field label="Tone read" value={selected.toneRead} empty="—" half />
                <Field label="Best channel" value={selected.bestChannel ?? (selected.email ? "Email" : null)} empty="Email" half />
              </div>
              <Field label="Region" value={selected.region} empty="Unknown" />
            </div>

            <p className="m-0 mb-2.5 text-[11px] font-semibold uppercase tracking-[1.6px] text-sweep-light">
              Next message it will send
            </p>
            <div className="rounded-[10px] bg-charcoal-soft p-4">
              <p className="m-0 text-[13px] leading-[1.55] text-[#9fd9c0]">
                {selected.status === "NEW"
                  ? "Drafting unlocks in Milestone 2 — once your voice profile is set, the agent writes a re-engagement email here, grounded only in the memory above."
                  : LEAD_STATUS_META[selected.status].label}
              </p>
            </div>
          </>
        ) : (
          <p className="m-0 text-[14px] text-on-dark-soft">Select a lead to see what the agent understands.</p>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  empty,
  half,
}: {
  label: string;
  value: string | null;
  empty: string;
  half?: boolean;
}) {
  return (
    <div className={half ? "flex-1" : undefined}>
      <p className="m-0 mb-0.5 text-[11.5px] text-on-dark-mute">{label}</p>
      <p className={`m-0 text-[14px] ${value ? "text-on-dark" : "italic text-on-dark-mute"}`}>
        {value || empty}
      </p>
    </div>
  );
}
