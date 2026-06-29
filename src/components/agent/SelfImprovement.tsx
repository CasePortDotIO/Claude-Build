"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { runReflectionAction, applyInsightAction, vetoInsightAction } from "@/server/actions/reflection";
import { toastResult } from "@/components/ui/Toast";
import { SpinnerLabel } from "@/components/ui/Spinner";

export interface InsightVM {
  id: string;
  kind: string;
  status: string;
  title: string;
  body: string;
  metric: string;
  when: string;
  informational: boolean; // AB_RESULT — no apply/veto
}

export interface AbVM {
  liftPct: number | null;
  treatmentRate: number;
  holdoutRate: number;
  treatmentN: number;
  holdoutN: number;
}

export function SelfImprovement({
  insights,
  ab,
  learning,
}: {
  insights: InsightVM[];
  ab: AbVM | null;
  learning: { bestSendHour: number | null; retiredPhrases: string[]; version: number; lastReflection: string | null };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) {
    startTransition(async () => {
      toastResult(await fn());
      router.refresh();
    });
  }

  const proposed = insights.filter((i) => i.status === "PROPOSED");
  const decided = insights.filter((i) => i.status !== "PROPOSED");

  return (
    <div className="space-y-[18px]">
      {/* A/B holdout card */}
      <div className="rounded-xl2 border border-line bg-white p-7 shadow-card">
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="m-0 text-[12px] font-semibold uppercase tracking-[1.6px] text-muted-2">A/B holdout — measured, not asserted</p>
          <button
            disabled={pending}
            onClick={() => run(() => runReflectionAction())}
            className="rounded-lg bg-charcoal px-3.5 py-2 text-[12.5px] font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {pending ? <SpinnerLabel>Reflecting…</SpinnerLabel> : "Run reflection"}
          </button>
        </div>
        {ab && ab.treatmentN + ab.holdoutN > 0 ? (
          <div className="flex flex-wrap items-end gap-8">
            <Stat label="Treatment (optimized)" value={`${Math.round(ab.treatmentRate * 100)}%`} sub={`reply · n=${ab.treatmentN}`} green />
            <Stat label="Holdout (control)" value={`${Math.round(ab.holdoutRate * 100)}%`} sub={`reply · n=${ab.holdoutN}`} />
            <Stat
              label="Measured lift"
              value={ab.liftPct === null ? "—" : `${ab.liftPct >= 0 ? "+" : ""}${Math.round(ab.liftPct)}%`}
              sub={ab.liftPct === null ? "need more holdout data" : "vs control"}
              green={ab.liftPct !== null && ab.liftPct >= 0}
            />
          </div>
        ) : (
          <p className="m-0 text-[13.5px] text-muted">
            ~15% of leads are held back as a control. Once enough have been contacted, the real lift of the agent&apos;s
            optimized copy shows here.
          </p>
        )}
      </div>

      {/* proposed insights (apply/veto) */}
      {proposed.length > 0 && (
        <div className="rounded-xl2 border border-[rgba(232,116,59,0.3)] bg-[#FBF3EC] p-7 shadow-card">
          <p className="m-0 mb-4 text-[12px] font-semibold uppercase tracking-[1.6px] text-[#9a6a44]">
            Proposed changes · your call
          </p>
          <div className="flex flex-col gap-3">
            {proposed.map((i) => (
              <div key={i.id} className="rounded-xl border border-[#f0dcc9] bg-white p-4">
                <div className="mb-1 flex items-center justify-between gap-3">
                  <p className="m-0 font-heading text-[15px] font-semibold text-ink">{i.title}</p>
                  <span className="rounded bg-[rgba(27,122,87,0.08)] px-2 py-0.5 font-mono text-[11px] text-sweep">{i.metric}</span>
                </div>
                <p className="m-0 mb-3 text-[13.5px] leading-[1.5] text-muted">{i.body}</p>
                <div className="flex gap-2">
                  {!i.informational && (
                    <button disabled={pending} onClick={() => run(() => applyInsightAction(i.id))} className="rounded-lg bg-sweep px-4 py-2 text-[12.5px] font-semibold text-white hover:opacity-90 disabled:opacity-60">
                      Apply
                    </button>
                  )}
                  <button disabled={pending} onClick={() => run(() => vetoInsightAction(i.id))} className="rounded-lg border border-line-3 bg-white px-4 py-2 text-[12.5px] font-semibold text-muted hover:bg-cream disabled:opacity-60">
                    {i.informational ? "Dismiss" : "Veto"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* what it taught itself (applied/vetoed log) */}
      <div className="rounded-xl2 border border-line bg-white p-7 shadow-card">
        <div className="mb-5 flex items-center justify-between gap-3">
          <p className="m-0 text-[12px] font-semibold uppercase tracking-[1.6px] text-muted-2">What it taught itself</p>
          <div className="flex items-center gap-3 text-[12px] text-muted-3">
            <span>v{learning.version}</span>
            {learning.bestSendHour !== null && <span>· best send {formatHour(learning.bestSendHour)}</span>}
            {learning.retiredPhrases.length > 0 && <span>· {learning.retiredPhrases.length} retired</span>}
          </div>
        </div>
        {decided.length === 0 ? (
          <p className="m-0 text-[14px] text-muted">
            No changes yet. As replies and bookings come in, run reflection — applied changes log here with the metric
            that justified each one.
          </p>
        ) : (
          <div className="flex flex-col">
            {decided.map((i) => (
              <div key={i.id} className="flex gap-4 border-b border-line-2 py-3 last:border-b-0">
                <div className={`mt-1.5 h-2.5 w-2.5 flex-none rounded-full ${i.status === "APPLIED" ? "bg-sweep" : "bg-muted-3"}`} />
                <div className="flex-1">
                  <div className="flex justify-between gap-3">
                    <p className="m-0 font-heading text-[14.5px] font-semibold text-ink">{i.title}</p>
                    <span className="flex-none text-[12px] text-muted-3">{i.status === "APPLIED" ? "applied" : "vetoed"} · {i.when}</span>
                  </div>
                  <p className="m-0 mt-0.5 text-[13px] text-muted">{i.body}</p>
                  <span className="mt-1.5 inline-block rounded-md bg-[rgba(27,122,87,0.08)] px-2 py-1 font-mono text-[11px] text-sweep">{i.metric}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, sub, green }: { label: string; value: string; sub: string; green?: boolean }) {
  return (
    <div>
      <p className="m-0 mb-1 text-[12px] text-muted-2">{label}</p>
      <p className={`m-0 font-heading text-[28px] font-semibold ${green ? "text-sweep" : "text-ink"}`}>{value}</p>
      <p className="m-0 text-[11.5px] text-muted-3">{sub}</p>
    </div>
  );
}

function formatHour(h: number): string {
  const ampm = h < 12 ? "am" : "pm";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}${ampm}`;
}
