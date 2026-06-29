"use client";

import { useEffect, useRef, useState } from "react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveDraftAction, rejectDraftAction, approveAllAction } from "@/server/actions/agent";
import { toast } from "@/components/ui/Toast";
import { Kbd } from "@/components/ui/Kbd";

export interface VariantVM {
  id: string;
  index: number;
  angle: string;
  subject: string;
  body: string;
  confidence: number;
  rationale: string;
  voiceMatch: number | null;
  voiceEcho: string | null;
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

/**
 * Keyboard-first approval triage. The daily core loop, built for speed: j/k to
 * move, [ ] to switch angle, e to edit, a to approve, r to reject — clear 50
 * drafts without the mouse. Approve/reject are optimistic (the row animates out
 * immediately and rolls back on failure), so it always feels instant.
 */
export function ApprovalQueue({ drafts }: { drafts: DraftVM[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [cleared, setCleared] = useState<Set<string>>(new Set());
  const [exitingId, setExitingId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(drafts[0]?.id ?? null);

  // Editor state (lifted into the parent so keyboard shortcuts can drive it).
  const [variantId, setVariantId] = useState<string>("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [dirty, setDirty] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const visible = drafts.filter((d) => !cleared.has(d.id));
  const active = visible.find((d) => d.id === activeId) ?? visible[0] ?? null;
  const variant = active?.variants.find((v) => v.id === variantId) ?? active?.variants[0] ?? null;

  function pick(v: VariantVM) {
    setVariantId(v.id);
    setSubject(v.subject);
    setBody(v.body);
    setDirty(false);
  }

  // When the active draft changes, load its selected (or best) variant.
  useEffect(() => {
    if (!active) return;
    const init = active.variants.find((v) => v.id === active.selectedVariantId) ?? active.variants[0];
    if (init) pick(init);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id]);

  function clearAndAdvance(id: string) {
    const idx = visible.findIndex((d) => d.id === id);
    const next = visible[idx + 1] ?? visible[idx - 1] ?? null;
    setExitingId(id);
    window.setTimeout(() => {
      setCleared((c) => new Set(c).add(id));
      setExitingId(null);
      if (next) setActiveId(next.id);
    }, 280);
  }

  function approve(d: DraftVM, vId: string, subj: string, bod: string) {
    clearAndAdvance(d.id);
    startTransition(async () => {
      const r = await approveDraftAction({ draftId: d.id, variantId: vId, subject: subj, body: bod });
      if (!r.ok) {
        setCleared((c) => { const n = new Set(c); n.delete(d.id); return n; });
        toast(r.error ?? "Couldn't approve — try again", "error");
      } else {
        toast(r.message ?? "Approved", "success");
        router.refresh();
      }
    });
  }

  function reject(d: DraftVM) {
    clearAndAdvance(d.id);
    startTransition(async () => {
      const r = await rejectDraftAction({ draftId: d.id });
      if (!r.ok) {
        setCleared((c) => { const n = new Set(c); n.delete(d.id); return n; });
        toast(r.error ?? "Couldn't reject — try again", "error");
      } else {
        toast(r.message ?? "Rejected", "success");
        router.refresh();
      }
    });
  }

  function cycleVariant(dir: 1 | -1) {
    if (!active) return;
    const vs = active.variants;
    const i = vs.findIndex((v) => v.id === variantId);
    pick(vs[(i + dir + vs.length) % vs.length]);
  }

  function approveAll() {
    if (visible.length === 0) return;
    const ids = visible.map((d) => d.id);
    setCleared((c) => { const n = new Set(c); ids.forEach((i) => n.add(i)); return n; });
    startTransition(async () => {
      const r = await approveAllAction();
      toast(r.message ?? "Approved all", "success");
      router.refresh();
    });
  }

  // Single global key handler reading the latest state via a ref (no stale
  // closures, no re-binding on every keystroke).
  const h = useRef({ visible, active, variantId, subject, body, approve, reject, cycleVariant });
  h.current = { visible, active, variantId, subject, body, approve, reject, cycleVariant };
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA");
      if (typing) {
        if (e.key === "Escape") (t as HTMLElement).blur();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const s = h.current;
      if (!s.active) return;
      const idx = s.visible.findIndex((d) => d.id === s.active!.id);
      switch (e.key) {
        case "j": case "ArrowDown": { e.preventDefault(); const n = s.visible[Math.min(idx + 1, s.visible.length - 1)]; if (n) setActiveId(n.id); break; }
        case "k": case "ArrowUp": { e.preventDefault(); const n = s.visible[Math.max(idx - 1, 0)]; if (n) setActiveId(n.id); break; }
        case "a": e.preventDefault(); s.approve(s.active, s.variantId, s.subject, s.body); break;
        case "r": e.preventDefault(); s.reject(s.active); break;
        case "e": e.preventDefault(); bodyRef.current?.focus(); break;
        case "[": e.preventDefault(); s.cycleVariant(-1); break;
        case "]": e.preventDefault(); s.cycleVariant(1); break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (visible.length === 0 || !active || !variant) {
    return (
      <div className="ws-rise rounded-xl2 border border-line bg-white p-12 text-center shadow-card">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-sweep-mist text-sweep">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
        </div>
        <p className="m-0 mb-1.5 font-heading text-[18px] font-semibold text-ink">{cleared.size > 0 ? "All caught up" : "Approval queue is clear"}</p>
        <p className="m-0 text-[14px] text-muted">
          {cleared.size > 0 ? "Every draft reviewed. Nice work." : "Generate drafts from the Leads page, then review them here before anything sends."}
        </p>
      </div>
    );
  }

  const activeIdx = visible.findIndex((d) => d.id === active.id);

  return (
    <div className="grid grid-cols-1 items-start gap-[18px] lg:grid-cols-[320px_1fr]">
      {/* queue list */}
      <div className="overflow-hidden rounded-xl2 border border-line bg-white shadow-card">
        <div className="flex items-center justify-between border-b border-line-2 bg-cream-head px-4 py-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.8px] text-muted-3">
            {visible.length} awaiting you
          </span>
          <button
            onClick={approveAll}
            className="rounded-md bg-sweep px-2.5 py-1 text-[11.5px] font-semibold text-white hover:opacity-90"
          >
            Approve all
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {visible.map((d) => {
            const on = d.id === active.id;
            const best = d.variants.find((v) => v.id === d.selectedVariantId) ?? d.variants[0];
            return (
              <button
                key={d.id}
                onClick={() => setActiveId(d.id)}
                aria-current={on || undefined}
                className={`relative block w-full overflow-hidden border-b border-line-2 px-4 py-3 pl-5 text-left last:border-b-0 transition-colors ${
                  exitingId === d.id ? "animate-wsExit" : ""
                } ${on ? "bg-cream" : "hover:bg-cream-head"}`}
              >
                {on && <span className="absolute left-0 top-0 h-full w-[3px] bg-sweep" />}
                <div className="flex items-center justify-between gap-2">
                  <p className="m-0 truncate text-[14px] font-semibold text-ink">{d.leadName}</p>
                  {best && (
                    <span className="flex-none font-mono text-[10.5px] text-muted-3">{Math.round(best.confidence * 100)}%</span>
                  )}
                </div>
                <p className="m-0 truncate text-[12px] text-muted-3">{d.leadEmail}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* editor — re-pops on selection change for a responsive feel */}
      <div key={active.id} className="animate-wsPop rounded-xl2 border border-line bg-white p-6 shadow-card">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-line-2 pb-4">
          <div className="min-w-0">
            <p className="m-0 font-heading text-[17px] font-semibold text-ink">{active.leadName}</p>
            <p className="m-0 text-[12.5px] text-muted-3">{active.leadEmail}</p>
          </div>
          <span className="flex-none rounded-md bg-charcoal-soft px-2.5 py-1 font-mono text-[11px] text-[#cdd2d6]">
            {activeIdx + 1} of {visible.length}
          </span>
        </div>
        {active.leadGoal && (
          <p className="m-0 mb-4 text-[12.5px] text-muted">
            <span className="font-semibold text-ink">Grounded in:</span> {active.leadGoal}
          </p>
        )}

        <div className="mb-4 flex flex-wrap items-center gap-2">
          {active.variants.map((v) => {
            const on = v.id === variantId;
            return (
              <button
                key={v.id}
                onClick={() => pick(v)}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-[12.5px] font-medium transition-colors ${
                  on ? "border-sweep bg-sweep-mist text-sweep" : "border-line bg-white text-muted hover:border-line-3"
                }`}
              >
                <span className="capitalize">{v.angle}</span>
                <span className="rounded bg-white/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-2">{Math.round(v.confidence * 100)}%</span>
              </button>
            );
          })}
          <span className="ml-auto hidden items-center gap-1 text-[11px] text-muted-3 sm:flex">
            <Kbd>[</Kbd><Kbd>]</Kbd> switch angle
          </span>
        </div>

        <p className="m-0 mb-3 text-[12px] italic text-muted-2">{variant.rationale}</p>

        {variant.voiceMatch != null && (
          <div className="mb-4 flex flex-wrap items-center gap-2.5 rounded-lg border border-[rgba(27,122,87,0.18)] bg-sweep-mist px-3.5 py-2.5">
            <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-sweep">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
              {Math.round(variant.voiceMatch * 100)}% match to your voice
            </span>
            {variant.voiceEcho && (
              <span className="text-[12px] text-ink-soft">
                · echoes your own words: <span className="italic text-sweep">&ldquo;{variant.voiceEcho}&rdquo;</span>
              </span>
            )}
          </div>
        )}

        <label className="mb-1.5 block text-[12px] font-semibold text-ink">Subject</label>
        <input
          value={subject}
          onChange={(e) => { setSubject(e.target.value); setDirty(true); }}
          className="mb-3 w-full rounded-lg border border-line-3 bg-white px-3 py-2.5 text-[14px] outline-none focus:border-sweep"
        />
        <label className="mb-1.5 block text-[12px] font-semibold text-ink">Message</label>
        <textarea
          ref={bodyRef}
          value={body}
          onChange={(e) => { setBody(e.target.value); setDirty(true); }}
          rows={12}
          className="mb-4 w-full resize-y rounded-lg border border-line-3 bg-cream px-4 py-3 font-sans text-[14px] leading-[1.6] text-ink-soft outline-none focus:border-sweep"
        />

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => approve(active, variantId, subject, body)}
            className="flex items-center gap-2 rounded-lg bg-sweep px-5 py-3 font-heading text-[14px] font-semibold text-white hover:opacity-90"
          >
            {dirty ? "Approve with edits" : "Approve"} <Kbd>A</Kbd>
          </button>
          <button
            onClick={() => reject(active)}
            className="flex items-center gap-2 rounded-lg border border-line-3 bg-white px-5 py-3 text-[14px] font-semibold text-muted hover:bg-cream"
          >
            Reject <Kbd>R</Kbd>
          </button>
        </div>

        {/* triage shortcut bar */}
        <div className="mt-5 hidden flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line-2 pt-3 text-[11.5px] text-muted-3 sm:flex">
          <span className="flex items-center gap-1"><Kbd>J</Kbd><Kbd>K</Kbd> move</span>
          <span className="flex items-center gap-1"><Kbd>A</Kbd> approve</span>
          <span className="flex items-center gap-1"><Kbd>R</Kbd> reject</span>
          <span className="flex items-center gap-1"><Kbd>E</Kbd> edit</span>
          <span className="flex items-center gap-1"><Kbd>[</Kbd><Kbd>]</Kbd> angle</span>
        </div>
      </div>
    </div>
  );
}
