"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { LEAD_STATUS_META } from "@/lib/types";
import { generateDraftsAction } from "@/server/actions/agent";
import { eraseLeadAction } from "@/server/actions/compliance";
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
  coldFor: string;
  objections: string[];
}

// The pending/approved draft preview for a lead, if any.
export interface DraftPreview {
  status: string;
  angle: string;
  confidence: number;
  subject: string;
  body: string;
  provider: string;
}

const ELIGIBLE = new Set<LeadStatus>(["NEW", "RESEARCHED", "COOLED", "SCHEDULED"]);

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

export function LeadsView({
  leads,
  drafts,
}: {
  leads: LeadRow[];
  drafts: Record<string, DraftPreview>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(leads[0]?.id ?? null);
  const [msg, setMsg] = useState<string | null>(null);
  const selected = leads.find((l) => l.id === selectedId) ?? null;

  const draftableIds = leads.filter((l) => ELIGIBLE.has(l.status) && !drafts[l.id]).map((l) => l.id);

  function generate(ids: string[]) {
    if (ids.length === 0) return;
    startTransition(async () => {
      const r = await generateDraftsAction({ leadIds: ids, variantCount: 3 });
      setMsg(r.ok ? `Drafted ${r.generated}, skipped ${r.skipped?.length ?? 0}.` : r.error ?? "Error");
      router.refresh();
      setTimeout(() => setMsg(null), 4000);
    });
  }

  if (leads.length === 0) {
    return (
      <div className="rounded-xl2 border border-line bg-white p-12 text-center">
        <p className="m-0 mb-2 font-heading text-[18px] font-semibold text-ink">No leads yet</p>
        <p className="m-0 text-[14px] text-muted">Import a CSV of prior contacts to start your first sweep.</p>
      </div>
    );
  }

  return (
    <>
      {/* bulk action bar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          disabled={pending || draftableIds.length === 0}
          onClick={() => generate(draftableIds)}
          className="rounded-lg bg-ember px-4 py-2.5 font-heading text-[13px] font-semibold text-white hover:bg-ember-hover disabled:opacity-50"
        >
          {pending ? "Drafting…" : `Generate drafts for ${draftableIds.length} eligible`}
        </button>
        <Link href="/approvals" className="text-[13px] font-semibold text-sweep hover:underline">
          Review approvals →
        </Link>
        {msg && <span className="text-[12.5px] text-muted">{msg}</span>}
      </div>

      <div className="grid grid-cols-1 items-start gap-[18px] lg:grid-cols-[1.5fr_1fr]">
        {/* table */}
        <div className="overflow-hidden rounded-xl2 border border-line bg-white">
          <div className="grid grid-cols-[1.6fr_0.9fr_1fr] gap-3 border-b border-line-2 bg-cream-head px-[22px] py-3.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.8px] text-muted-3">Contact</span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.8px] text-muted-3">Draft</span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.8px] text-muted-3">Status</span>
          </div>
          {leads.map((l) => {
            const on = l.id === selectedId;
            const d = drafts[l.id];
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
                <span className="text-[12px] text-muted">
                  {d ? <span className="font-semibold text-sweep">{Math.round(d.confidence * 100)}%</span> : "—"}
                </span>
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
                <Field label="Originally inquired about" value={selected.originalInquiry} empty="Not captured." />
                <Field label="Their stated goal" value={selected.statedGoal} empty="Not captured." />
                <div className="flex gap-5">
                  <Field label="Tone read" value={selected.toneRead} empty="—" half />
                  <Field label="Best channel" value={selected.bestChannel ?? "Email"} empty="Email" half />
                </div>
                {selected.objections.length > 0 && (
                  <Field label="Objections" value={selected.objections.join("; ")} empty="—" />
                )}
              </div>

              <p className="m-0 mb-2.5 text-[11px] font-semibold uppercase tracking-[1.6px] text-sweep-light">
                Next message it will send
              </p>
              <NextMessage
                draft={drafts[selected.id]}
                lead={selected}
                pending={pending}
                onGenerate={() => generate([selected.id])}
              />

              {/* GDPR controls (§9): export + erasure */}
              <div className="mt-5 flex items-center gap-3 border-t border-[#2a2f34] pt-4">
                <a
                  href={`/api/leads/${selected.id}/export`}
                  className="text-[12px] font-semibold text-on-dark-soft hover:text-white hover:underline"
                >
                  Export data (JSON)
                </a>
                <button
                  disabled={pending}
                  onClick={() => {
                    if (!confirm(`Permanently erase ${fullName(selected)} and all their data? Their email stays on do-not-contact.`)) return;
                    startTransition(async () => {
                      const r = await eraseLeadAction(selected.id);
                      setMsg(r.ok ? r.message ?? "Erased" : r.error ?? "Error");
                      setSelectedId(null);
                      router.refresh();
                      setTimeout(() => setMsg(null), 4000);
                    });
                  }}
                  className="text-[12px] font-semibold text-[#e08b8b] hover:underline disabled:opacity-60"
                >
                  Erase (GDPR)
                </button>
              </div>
            </>
          ) : (
            <p className="m-0 text-[14px] text-on-dark-soft">Select a lead to see what the agent understands.</p>
          )}
        </div>
      </div>
    </>
  );
}

function NextMessage({
  draft,
  lead,
  pending,
  onGenerate,
}: {
  draft?: DraftPreview;
  lead: LeadRow;
  pending: boolean;
  onGenerate: () => void;
}) {
  if (draft) {
    return (
      <div className="rounded-[10px] bg-charcoal-soft p-4">
        <div className="mb-2 flex items-center gap-2">
          <span className="rounded bg-sweep-mist px-2 py-0.5 text-[10.5px] font-semibold capitalize text-sweep">
            {draft.angle}
          </span>
          <span className="font-mono text-[10.5px] text-on-dark-mute">{Math.round(draft.confidence * 100)}% · {draft.provider}</span>
          <span className="ml-auto text-[10.5px] uppercase tracking-wide text-on-dark-mute">{draft.status.replace(/_/g, " ").toLowerCase()}</span>
        </div>
        <p className="m-0 mb-1.5 text-[13px] font-semibold text-on-dark">{draft.subject}</p>
        <p className="m-0 whitespace-pre-line text-[12.5px] leading-[1.55] text-[#cdd2d6]">{draft.body}</p>
        <Link href="/approvals" className="mt-3 inline-block text-[12px] font-semibold text-sweep-light hover:underline">
          Review in approvals →
        </Link>
      </div>
    );
  }

  const eligible = ELIGIBLE.has(lead.status);
  return (
    <div className="rounded-[10px] bg-charcoal-soft p-4">
      <p className="m-0 mb-3 text-[13px] leading-[1.55] text-on-dark-soft">
        {eligible
          ? "No draft yet. The agent will write a re-engagement email grounded only in the memory above — for your approval."
          : `Lead is ${LEAD_STATUS_META[lead.status].label.toLowerCase()} — not eligible for a new draft.`}
      </p>
      {eligible && (
        <button
          disabled={pending}
          onClick={onGenerate}
          className="rounded-lg bg-sweep-light px-3.5 py-2 text-[12.5px] font-semibold text-charcoal hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Drafting…" : "Generate draft"}
        </button>
      )}
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
      <p className={`m-0 text-[14px] ${value ? "text-on-dark" : "italic text-on-dark-mute"}`}>{value || empty}</p>
    </div>
  );
}
