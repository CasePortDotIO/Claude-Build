"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitIntakeAction } from "@/server/actions/onboarding";
import type { OnboardingStatus, OnboardingStage, QuickWin } from "@/lib/onboarding";
import { SpinnerLabel } from "@/components/ui/Spinner";

const STAGES: { key: OnboardingStage; label: string; sla: string }[] = [
  { key: "INTAKE", label: "Intake", sla: "Tell us who to reach" },
  { key: "BUILDING", label: "Building your sweep", sla: "within 48h" },
  { key: "OUTREACH", label: "First outreach", sla: "within 72h" },
  { key: "LIVE", label: "Booked calls landing", sla: "5–7 days" },
];

/**
 * Post-purchase activation (p8): the build tracker + the 3 quick-win leads. Shown
 * on the dashboard until the workspace goes live (first booking). Admins who
 * haven't submitted intake see the 5-minute intake form; submitting reveals the
 * quick-wins instantly and starts the sweep building.
 */
export function ActivationPanel({
  status,
  quickWins: initialQuickWins,
  isAdmin,
}: {
  status: OnboardingStatus;
  quickWins: QuickWin[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [icp, setIcp] = useState(status.idealClient ?? "");
  const [link, setLink] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [quickWins, setQuickWins] = useState<QuickWin[]>(initialQuickWins);
  const [submitted, setSubmitted] = useState(status.submitted);

  function submit() {
    setError(null);
    start(async () => {
      const r = await submitIntakeAction({ idealClient: icp, bookingLink: link || undefined });
      if (r.ok) {
        setQuickWins(r.quickWins ?? []);
        setSubmitted(true);
        router.refresh();
      } else {
        setError(r.error ?? "Couldn't save — try again.");
      }
    });
  }

  const activeIdx = STAGES.findIndex((s) => s.key === status.stage);

  return (
    <div className="ws-rise mb-6 rounded-xl2 border border-line bg-white p-5 shadow-card sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="m-0 text-[11.5px] font-semibold uppercase tracking-[1.2px] text-sweep">Getting you to your first booked call</p>
          <h2 className="m-0 mt-0.5 font-heading text-[18px] font-semibold tracking-[-0.3px] text-ink">Your sweep is being set up</h2>
        </div>
      </div>

      {/* Build tracker */}
      <ol className="mb-1 flex flex-col gap-0 sm:flex-row sm:gap-2">
        {STAGES.map((s, i) => {
          const done = status.reached[s.key] && i < activeIdx;
          const current = i === activeIdx;
          return (
            <li key={s.key} className="flex flex-1 items-start gap-2.5 sm:flex-col sm:items-stretch">
              <div className="flex items-center gap-2 sm:mb-1.5">
                <span
                  className={`flex h-5 w-5 flex-none items-center justify-center rounded-full text-[11px] font-bold ${
                    done ? "bg-sweep text-white" : current ? "border-2 border-sweep bg-white text-sweep" : "border border-line-3 bg-cream text-muted-3"
                  }`}
                >
                  {done ? "✓" : i + 1}
                </span>
                <span className="hidden h-0.5 flex-1 rounded bg-line-2 sm:block" />
              </div>
              <div className="pb-3 sm:pb-0">
                <p className={`m-0 text-[13px] font-semibold ${current ? "text-ink" : done ? "text-ink-soft" : "text-muted-2"}`}>{s.label}</p>
                <p className="m-0 text-[11.5px] text-muted-3">{s.sla}</p>
              </div>
            </li>
          );
        })}
      </ol>

      {/* Intake form (admins, pre-submit) */}
      {isAdmin && !submitted && (
        <div className="mt-4 rounded-xl border border-line-2 bg-cream-head p-4">
          <label className="mb-1.5 block text-[12.5px] font-semibold text-ink">Who is your ideal client? <span className="font-normal text-muted-3">(a sentence or two)</span></label>
          <textarea
            value={icp}
            onChange={(e) => setIcp(e.target.value)}
            rows={2}
            placeholder="e.g. Busy service-business owners doing $20k–$80k/mo who asked about our program but never booked."
            className="w-full resize-none rounded-lg border border-line-3 bg-white px-3 py-2 text-[13.5px] leading-[1.5] outline-none focus:border-sweep"
          />
          <label className="mb-1.5 mt-3 block text-[12.5px] font-semibold text-ink">Booking link <span className="font-normal text-muted-3">(optional — where calls get scheduled)</span></label>
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://cal.com/you/intro"
            className="w-full rounded-lg border border-line-3 bg-white px-3 py-2 text-[13.5px] outline-none focus:border-sweep"
          />
          <p className="m-0 mt-2 text-[11.5px] text-muted-3">Tip: import at least {50} leads so the guarantee kicks in.</p>
          {error && <p className="m-0 mt-2 text-[12.5px] font-medium text-ember">{error}</p>}
          <button
            onClick={submit}
            disabled={pending || !icp.trim()}
            className="mt-3 w-full rounded-lg bg-sweep px-4 py-2.5 font-heading text-[13.5px] font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {pending ? <SpinnerLabel>Starting your sweep…</SpinnerLabel> : "Submit intake — start building"}
          </button>
        </div>
      )}

      {/* Quick-wins (post-submit) */}
      {submitted && quickWins.length > 0 && (
        <div className="mt-4">
          <p className="m-0 mb-2 text-[12.5px] font-semibold text-ink">3 quick wins — your warmest leads, ready to send</p>
          <div className="flex flex-col gap-2">
            {quickWins.map((q) => (
              <QuickWinRow key={q.leadId} win={q} />
            ))}
          </div>
        </div>
      )}

      {submitted && quickWins.length === 0 && (
        <p className="m-0 mt-4 rounded-lg border border-line-2 bg-cream px-3.5 py-3 text-[12.5px] text-muted">
          Import your leads and your warmest 3 will appear here with a ready-to-send opener each.
        </p>
      )}

      {!isAdmin && !submitted && (
        <p className="m-0 mt-4 text-[12.5px] text-muted-3">A workspace admin is finishing setup. You&apos;ll see leads moving here shortly.</p>
      )}
    </div>
  );
}

function QuickWinRow({ win }: { win: QuickWin }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(win.opener);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the text is visible to copy manually */
    }
  }
  return (
    <div className="rounded-lg border border-line-2 bg-white px-3.5 py-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="font-heading text-[13px] font-semibold text-ink">
          {win.name}
          {win.company ? <span className="font-normal text-muted-3"> · {win.company}</span> : null}
        </span>
        <button
          onClick={copy}
          className="flex-none rounded-md border border-line-3 px-2.5 py-1 text-[11.5px] font-semibold text-muted hover:border-sweep hover:text-sweep"
        >
          {copied ? "Copied ✓" : "Copy opener"}
        </button>
      </div>
      <p className="m-0 text-[12.5px] leading-[1.5] text-muted-2">{win.opener}</p>
    </div>
  );
}
