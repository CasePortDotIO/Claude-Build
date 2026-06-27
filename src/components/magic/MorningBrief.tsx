"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatMoney } from "@/lib/format";
import type { DailyBrief } from "@/lib/retention";
import type { StreakState } from "@/lib/streak";

/**
 * The Morning Brief (M10) — the habit loop's daily payoff. The nightly agent run
 * produces fresh material every night; this surfaces it as the first thing the
 * operator sees, with the variable reward (who replied, who booked) that turns an
 * occasional tool into a daily ritual. Collapses once per calendar day so it
 * greets, never nags — re-expands tomorrow with a new overnight story.
 */
export function MorningBrief({ brief, streak, dateKey }: { brief: DailyBrief; streak: StreakState; dateKey: string }) {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(`ws-brief-${dateKey}`)) setOpen(false);
    } catch {
      /* keep open */
    }
  }, [dateKey]);

  function collapse() {
    try {
      window.localStorage.setItem(`ws-brief-${dateKey}`, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  }

  const stats = [
    { n: brief.drafted, label: brief.drafted === 1 ? "email drafted" : "emails drafted" },
    { n: brief.replied, label: brief.replied === 1 ? "lead replied" : "leads replied" },
    { n: brief.booked, label: brief.booked === 1 ? "call booked" : "calls booked" },
  ];

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mb-[22px] flex w-full items-center gap-3 rounded-xl2 border border-line bg-white px-5 py-3 text-left hover:bg-cream"
      >
        <span className="text-[16px]">☀️</span>
        <span className="text-[13.5px] font-semibold text-ink">Your morning brief</span>
        {streak.current > 0 && (
          <span className="flex items-center gap-1 rounded-full bg-[#fdf0e8] px-2 py-0.5 text-[12px] font-semibold text-ember">
            🔥 {streak.current}
          </span>
        )}
        <span className="text-[12.5px] text-muted-2">
          {brief.drafted} drafted · {brief.replied} replied · {brief.booked} booked
          {brief.pendingApprovals > 0 && ` · ${brief.pendingApprovals} awaiting you`}
        </span>
        <span className="ml-auto text-[12px] text-muted-3">Expand ↓</span>
      </button>
    );
  }

  return (
    <div className="ws-rise mb-[22px] overflow-hidden rounded-xl2 border border-line bg-white">
      <div className="flex items-center justify-between border-b border-line-2 bg-charcoal px-6 py-4">
        <div className="flex items-center gap-2.5">
          <span className="text-[18px]">☀️</span>
          <div>
            <p className="m-0 font-heading text-[16px] font-semibold text-white">Your morning brief</p>
            <p className="m-0 text-[12px] text-on-dark-soft">While you were away, the agent kept working.</p>
          </div>
        </div>
        <button onClick={collapse} aria-label="Collapse" className="flex h-8 w-8 items-center justify-center rounded-lg text-on-dark-soft hover:bg-charcoal-soft">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 15l-6-6-6 6" /></svg>
        </button>
      </div>

      <StreakBar streak={streak} />

      <div className="px-6 py-5">
        {brief.hasActivity ? (
          <>
            <div className="mb-4 grid grid-cols-3 gap-3">
              {stats.map((s) => (
                <div key={s.label} className="rounded-xl2 border border-line bg-cream px-4 py-3 text-center">
                  <p className="m-0 font-heading text-[26px] font-semibold tabular-nums text-ink">{s.n}</p>
                  <p className="m-0 text-[11.5px] text-muted-2">{s.label}</p>
                </div>
              ))}
            </div>

            {brief.recoveredCents > 0 && (
              <p className="m-0 mb-3 text-[14px] text-ink-soft">
                <span className="font-semibold text-sweep">{formatMoney(brief.recoveredCents)}</span> in pipeline reactivated in the last day
                {brief.cumulativeRecoveredCents > brief.recoveredCents && (
                  <> · <span className="font-semibold text-ink">{formatMoney(brief.cumulativeRecoveredCents)}</span> recovered all-time</>
                )}
                .
              </p>
            )}

            {brief.latestInsight && (
              <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-[rgba(27,122,87,0.18)] bg-sweep-mist px-3.5 py-2.5">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1B7A57" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 flex-none">
                  <path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8" /><circle cx="12" cy="12" r="3.2" />
                </svg>
                <p className="m-0 text-[12.5px] leading-[1.45] text-ink-soft">
                  <span className="font-semibold text-sweep">It learned something: </span>{brief.latestInsight.body}
                </p>
              </div>
            )}
          </>
        ) : (
          <p className="m-0 mb-4 text-[13.5px] text-muted">
            Quiet night. Import a sweep or generate drafts and the agent will have a story for you tomorrow morning.
          </p>
        )}

        {brief.pendingApprovals > 0 ? (
          <Link
            href="/approvals"
            className="inline-flex items-center gap-2 rounded-lg bg-ember px-4 py-2.5 font-heading text-[13.5px] font-semibold text-white hover:bg-ember-hover"
          >
            {brief.pendingApprovals} draft{brief.pendingApprovals === 1 ? "" : "s"} need your nod →
          </Link>
        ) : (
          <Link
            href="/leads"
            className="inline-flex items-center gap-2 rounded-lg border border-line-3 bg-white px-4 py-2.5 text-[13.5px] font-semibold text-muted hover:bg-cream"
          >
            Start the next sweep →
          </Link>
        )}
      </div>
    </div>
  );
}

const DOW = ["S", "M", "T", "W", "T", "F", "S"];

function StreakBar({ streak }: { streak: StreakState }) {
  const headline =
    streak.current === 0
      ? "Start a streak — review a draft today"
      : streak.activeToday
        ? `🔥 ${streak.current}-day streak — kept alive today`
        : `🔥 ${streak.current}-day streak — review today to keep it going`;

  return (
    <div
      className={`flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-6 py-3 ${
        streak.atRisk ? "border-[#f0dcc9] bg-[#fdf4ec]" : "border-line-2 bg-cream"
      }`}
    >
      <span className={`text-[13px] font-semibold ${streak.atRisk ? "text-ember" : streak.current > 0 ? "text-ink" : "text-muted-2"}`}>
        {headline}
      </span>

      {/* week tracker — the chain you don't want to break */}
      <div className="flex items-center gap-1.5">
        {streak.week.map((d) => (
          <div key={d.date} className="flex flex-col items-center gap-1">
            <span
              title={d.date}
              className={`flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-semibold ${
                d.active
                  ? "bg-sweep text-white"
                  : d.isToday
                    ? "border-2 border-dashed border-ember bg-white text-ember"
                    : "bg-white text-muted-3 ring-1 ring-line-2"
              }`}
            >
              {d.active ? "✓" : DOW[new Date(`${d.date}T00:00:00Z`).getUTCDay()]}
            </span>
          </div>
        ))}
      </div>

      {streak.longest > streak.current && (
        <span className="text-[11.5px] text-muted-3">best: {streak.longest} days</span>
      )}
    </div>
  );
}
