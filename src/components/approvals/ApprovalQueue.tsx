"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  approveDraftAction,
  rejectDraftAction,
  approveAllAction,
} from "@/server/actions/agent";

export interface VariantVM {
  id: string;
  index: number;
  angle: string;
  subject: string;
  body: string;
  confidence: number;
  rationale: string;
}
export interface DraftVM {
  id: string;
  leadName: string;
  leadEmail: string;
  leadGoal: string | null;
  selectedVariantId: string | null;
  provider: string;
  model: string;
  variants: VariantVM[];
}

export function ApprovalQueue({ drafts }: { drafts: DraftVM[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [activeId, setActiveId] = useState<string | null>(drafts[0]?.id ?? null);
  const [toast, setToast] = useState<string | null>(null);

  if (drafts.length === 0) {
    return (
      <div className="rounded-xl2 border border-line bg-white p-12 text-center">
        <p className="m-0 mb-2 font-heading text-[18px] font-semibold text-ink">Approval queue is clear</p>
        <p className="m-0 text-[14px] text-muted">
          Generate drafts from the Leads page, then review them here before anything sends.
        </p>
      </div>
    );
  }

  const active = drafts.find((d) => d.id === activeId) ?? drafts[0];

  function refresh(msg: string) {
    setToast(msg);
    router.refresh();
    setTimeout(() => setToast(null), 3500);
  }

  return (
    <div className="grid grid-cols-1 items-start gap-[18px] lg:grid-cols-[320px_1fr]">
      {/* queue list */}
      <div className="overflow-hidden rounded-xl2 border border-line bg-white">
        <div className="flex items-center justify-between border-b border-line-2 bg-cream-head px-4 py-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.8px] text-muted-3">
            {drafts.length} awaiting you
          </span>
          <button
            disabled={pending}
            onClick={() => startTransition(async () => { const r = await approveAllAction(); refresh(r.message ?? "Approved all"); })}
            className="rounded-md bg-sweep px-2.5 py-1 text-[11.5px] font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            Approve all
          </button>
        </div>
        {drafts.map((d) => {
          const on = d.id === active.id;
          return (
            <button
              key={d.id}
              onClick={() => setActiveId(d.id)}
              className={`block w-full border-b border-line-2 px-4 py-3 text-left last:border-b-0 ${on ? "bg-cream" : "hover:bg-cream-head"}`}
            >
              <p className="m-0 truncate text-[14px] font-semibold text-ink">{d.leadName}</p>
              <p className="m-0 truncate text-[12px] text-muted-3">{d.leadEmail}</p>
            </button>
          );
        })}
      </div>

      {/* editor */}
      <DraftEditor
        key={active.id}
        draft={active}
        pending={pending}
        onApprove={(variantId, subject, body) =>
          startTransition(async () => {
            const r = await approveDraftAction({ draftId: active.id, variantId, subject, body });
            refresh(r.ok ? r.message ?? "Approved" : r.error ?? "Error");
          })
        }
        onReject={(reason) =>
          startTransition(async () => {
            const r = await rejectDraftAction({ draftId: active.id, reason });
            refresh(r.ok ? r.message ?? "Rejected" : r.error ?? "Error");
          })
        }
      />

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl2 border border-[#2a3f36] bg-charcoal px-5 py-3 text-[13.5px] font-medium text-white shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}

function DraftEditor({
  draft,
  pending,
  onApprove,
  onReject,
}: {
  draft: DraftVM;
  pending: boolean;
  onApprove: (variantId: string, subject: string, body: string) => void;
  onReject: (reason?: string) => void;
}) {
  const initial = draft.variants.find((v) => v.id === draft.selectedVariantId) ?? draft.variants[0];
  const [variantId, setVariantId] = useState(initial.id);
  const variant = draft.variants.find((v) => v.id === variantId) ?? initial;
  const [subject, setSubject] = useState(variant.subject);
  const [body, setBody] = useState(variant.body);
  const [dirty, setDirty] = useState(false);

  function pick(v: VariantVM) {
    setVariantId(v.id);
    setSubject(v.subject);
    setBody(v.body);
    setDirty(false);
  }

  return (
    <div className="rounded-xl2 border border-line bg-white p-6">
      {/* lead context */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-line-2 pb-4">
        <div>
          <p className="m-0 font-heading text-[17px] font-semibold text-ink">{draft.leadName}</p>
          <p className="m-0 text-[12.5px] text-muted-3">{draft.leadEmail}</p>
        </div>
        <span className="rounded-md bg-charcoal-soft px-2.5 py-1 font-mono text-[11px] text-[#cdd2d6]">
          {draft.provider} · {draft.model}
        </span>
      </div>
      {draft.leadGoal && (
        <p className="m-0 mb-4 text-[12.5px] text-muted">
          <span className="font-semibold text-ink">Grounded in:</span> {draft.leadGoal}
        </p>
      )}

      {/* variant tabs */}
      <div className="mb-4 flex flex-wrap gap-2">
        {draft.variants.map((v) => {
          const on = v.id === variantId;
          return (
            <button
              key={v.id}
              onClick={() => pick(v)}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-[12.5px] font-medium ${
                on ? "border-sweep bg-sweep-mist text-sweep" : "border-line bg-white text-muted hover:border-line-3"
              }`}
            >
              <span className="capitalize">{v.angle}</span>
              <span className="rounded bg-white/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-2">
                {Math.round(v.confidence * 100)}%
              </span>
            </button>
          );
        })}
      </div>

      <p className="m-0 mb-3 text-[12px] italic text-muted-2">{variant.rationale}</p>

      {/* editable email */}
      <label className="mb-1.5 block text-[12px] font-semibold text-ink">Subject</label>
      <input
        value={subject}
        onChange={(e) => { setSubject(e.target.value); setDirty(true); }}
        className="mb-3 w-full rounded-lg border border-line-3 bg-white px-3 py-2.5 text-[14px] outline-none focus:border-sweep"
      />
      <label className="mb-1.5 block text-[12px] font-semibold text-ink">Message</label>
      <textarea
        value={body}
        onChange={(e) => { setBody(e.target.value); setDirty(true); }}
        rows={12}
        className="mb-4 w-full resize-y rounded-lg border border-line-3 bg-cream px-4 py-3 font-sans text-[14px] leading-[1.6] text-ink-soft outline-none focus:border-sweep"
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          disabled={pending}
          onClick={() => onApprove(variantId, subject, body)}
          className="rounded-lg bg-sweep px-5 py-3 font-heading text-[14px] font-semibold text-white hover:opacity-90 disabled:opacity-60"
        >
          {dirty ? "Approve with edits →" : "Approve →"}
        </button>
        <button
          disabled={pending}
          onClick={() => onReject()}
          className="rounded-lg border border-line-3 bg-white px-5 py-3 text-[14px] font-semibold text-muted hover:bg-cream disabled:opacity-60"
        >
          Reject
        </button>
        <span className="ml-auto text-[12px] text-muted-3">
          Nothing sends in v1 without your approval · sending lands in M3
        </span>
      </div>
    </div>
  );
}
