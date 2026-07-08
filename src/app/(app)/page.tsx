import Link from "next/link";
import { requireOrg } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/nav/Topbar";
import { commandCenterKpis, reactivationsChart, activityFeed, firstRunState, latestBooking } from "@/lib/metrics";
import { formatMoney, timeAgo } from "@/lib/format";
import { FirstRunGuide } from "@/components/magic/FirstRunGuide";
import { BookingCelebration } from "@/components/magic/BookingCelebration";
import { MorningBrief } from "@/components/magic/MorningBrief";
import { GuaranteeTracker } from "@/components/magic/GuaranteeTracker";
import { ReactivationsChart } from "@/components/dashboard/ReactivationsChart";
import { SampleDataBanner } from "@/components/dashboard/SampleDataBanner";
import { LoadSampleDataPrompt } from "@/components/dashboard/LoadSampleDataPrompt";
import { SAMPLE_SOURCE } from "@/lib/sample/seed";
import { dailyBrief } from "@/lib/retention";
import { engagementStreak } from "@/lib/streak";
import { guaranteeStatus } from "@/lib/guarantee";
import { onboardingStatus, pickQuickWins } from "@/lib/onboarding";
import { ActivationPanel } from "@/components/onboarding/ActivationPanel";
import { ROLE_RANK } from "@/lib/roles";
import { exploreModeEnabled } from "@/lib/config/flags";

// Command Center — real data (M4). KPI row, reactivations chart, live activity
// feed, and the latest agent action. The "agent updated itself" self-improvement
// card (with metric-justified changes) is M6; here we surface the latest real run.
export default async function CommandCenter() {
  const ctx = await requireOrg();
  const [kpis, chart, activity, latestInsight, firstRun, recentBooking, brief] = await Promise.all([
    commandCenterKpis(ctx.orgId),
    reactivationsChart(ctx.orgId),
    activityFeed(ctx.orgId),
    prisma.insight.findFirst({ where: { orgId: ctx.orgId, status: "APPLIED" }, orderBy: { appliedAt: "desc" } }),
    firstRunState(ctx.orgId),
    latestBooking(ctx.orgId),
    dailyBrief(ctx.orgId),
  ]);
  const [streak, guarantee, sampleCount, onboarding, explore] = await Promise.all([
    engagementStreak(ctx.orgId),
    guaranteeStatus(ctx.orgId),
    prisma.lead.count({ where: { orgId: ctx.orgId, source: SAMPLE_SOURCE } }),
    onboardingStatus(ctx.orgId),
    exploreModeEnabled(),
  ]);
  const hasSample = sampleCount > 0;
  // p8 activation: the build tracker + quick-wins, shown until the workspace goes
  // live (first booking). Suppressed while exploring sample data.
  const showActivation = onboarding.showPanel && !hasSample;
  const isAdmin = ROLE_RANK[ctx.role] >= ROLE_RANK.CLIENT_ADMIN;
  const quickWins = showActivation && onboarding.submitted ? await pickQuickWins(ctx.orgId) : [];
  const today = new Date().toISOString().slice(0, 10); // per-day collapse key for the brief

  // Celebrate a booking only while it's fresh (< 48h); the component remembers
  // dismissal. Suppressed while the workspace is still on sample data — the
  // sample booking shouldn't fake a real win.
  const celebrate =
    !hasSample && recentBooking && Date.now() - recentBooking.bookedAt.getTime() < 48 * 3600 * 1000 ? recentBooking : null;

  return (
    <>
      <Topbar title="Command Center" subtitle="Your reactivation at a glance" />
      <div className="ws-rise flex-1 px-4 pb-[60px] pt-[30px] sm:px-6 lg:px-[34px]">
        {/* Alive-from-zero: frame the seeded sample data + offer the next steps */}
        {hasSample && <SampleDataBanner />}

        {/* Empty workspace (no real leads) — one-click explore, test only */}
        {explore && !hasSample && firstRun.leadCount === 0 && <LoadSampleDataPrompt />}

        {/* p8: post-purchase activation — intake → build tracker → quick wins */}
        {showActivation && <ActivationPanel status={onboarding} quickWins={quickWins} isAdmin={isAdmin} />}

        {/* M9: the payoff moment — a fresh booking lands loud */}
        {celebrate && (
          <BookingCelebration
            booking={{
              id: celebrate.id,
              name: celebrate.name,
              valueCents: celebrate.valueCents,
              bookedAt: celebrate.bookedAt.toISOString(),
              coldFor: celebrate.coldFor,
            }}
          />
        )}

        {/* M9: guided first sweep — shown until they take one lead all the way to
            a send. Suppressed while on sample data (the banner is onboarding then). */}
        {!firstRun.complete && !hasSample && !showActivation && <FirstRunGuide state={firstRun} operatorName={ctx.name ?? ""} />}

        {/* M10: the daily habit loop — what the agent did overnight (real data only) */}
        {firstRun.complete && !hasSample && <MorningBrief brief={brief} streak={streak} dateKey={today} />}

        {/* KPI row */}
        <div className="mb-[22px] grid grid-cols-1 gap-[18px] md:grid-cols-2 xl:grid-cols-4">
          <div className="relative overflow-hidden rounded-xl2 bg-sweep p-[22px] text-white shadow-card">
            <p className="m-0 mb-3 text-[12.5px] font-medium text-[#bfe6d5]">Recovered this month</p>
            <p className="m-0 mb-2 font-heading text-[34px] font-semibold tracking-[-1px] tabular-nums">
              {formatMoney(kpis.recoveredThisMonthCents)}
            </p>
            <p className="m-0 text-[12.5px] text-[#bfe6d5]">
              from {kpis.callsBookedThisMonth} booked call{kpis.callsBookedThisMonth === 1 ? "" : "s"}
              {kpis.recoveredRevenueCents > kpis.recoveredThisMonthCents ? ` · ${formatMoney(kpis.recoveredRevenueCents)} all-time` : ""}
            </p>
          </div>
          <KpiCard label="Calls booked" value={kpis.callsBooked} sub={kpis.callsShowed > 0 ? `${kpis.callsShowed} showed` : "agent → calendar"} />
          <KpiCard
            label="Reply rate"
            value={`${Math.round(kpis.replyRate * 100)}%`}
            sub={`${kpis.replied} of ${kpis.contacted} contacted`}
          />
          <KpiCard label="Reachable in play" value={kpis.reachableWorking} sub="verified leads being worked" accent />
        </div>

        {/* §8: the guarantee, measurable in-product */}
        <div className="mb-[22px]">
          <GuaranteeTracker status={guarantee} />
        </div>

        {/* the agent updated itself — wired to the latest applied insight */}
        {(latestInsight || activity.find((a) => a.kind === "agent")) && (
          <div className="mb-[22px] overflow-hidden rounded-xl2 bg-charcoal p-[26px] px-7 shadow-card">
            <div className="mb-4 flex items-center gap-2.5">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5CA98A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8" />
                <circle cx="12" cy="12" r="3.2" />
              </svg>
              <p className="m-0 font-sans text-[12px] font-semibold uppercase tracking-[1.8px] text-sweep-light">
                {latestInsight
                  ? `The agent updated itself · ${timeAgo(latestInsight.appliedAt ?? latestInsight.createdAt)}`
                  : `The agent is working · ${timeAgo(activity.find((a) => a.kind === "agent")!.at)}`}
              </p>
            </div>
            <p className="m-0 mb-[18px] max-w-[760px] font-heading text-[20px] font-medium leading-[1.4] text-white">
              {latestInsight ? (
                latestInsight.body
              ) : (
                <>
                  Every email is grounded in real memory and waits for your approval. It revives cold leads, handles the
                  replies, and books the call — and it&apos;s learning your{" "}
                  <span className="text-sweep-light">best send-times</span> and{" "}
                  <span className="text-sweep-light">openers</span> as outcomes come in.
                </>
              )}
            </p>
            <div className="flex flex-wrap gap-2.5">
              {latestInsight && <Chip>{latestInsight.metric}</Chip>}
              <Chip>{kpis.callsBooked} booked</Chip>
              <Chip>reply rate {Math.round(kpis.replyRate * 100)}%</Chip>
              <Link href="/agent" className="ml-auto rounded-md bg-sweep-light px-3 py-1.5 text-[12.5px] font-semibold text-charcoal hover:bg-[#6dbd9b]">
                See what it learned →
              </Link>
            </div>
          </div>
        )}

        {/* split: chart + activity */}
        <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-[1.45fr_1fr]">
          <ReactivationsChart bars={chart} />

          <div className="rounded-xl2 border border-line bg-white p-6 shadow-card">
            <p className="m-0 mb-4 font-heading text-[16px] font-semibold text-ink">Live activity</p>
            {activity.length === 0 ? (
              <p className="m-0 text-[13.5px] text-muted">Nothing yet — generate drafts and send to see the feed fill up.</p>
            ) : (
              <div className="flex flex-col">
                {activity.map((a) => (
                  <div key={a.id} className="flex gap-3 border-b border-line-2 py-2.5 last:border-b-0">
                    <span className={`mt-1.5 h-2 w-2 flex-none rounded-full ${DOT[a.kind]}`} />
                    <div className="min-w-0">
                      <p className="m-0 text-[13.5px] leading-[1.4] text-ink-soft">{a.text}</p>
                      <p className="m-0 text-[11.5px] text-muted-3">{timeAgo(a.at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

const DOT: Record<string, string> = {
  booking: "bg-sweep",
  sent: "bg-avatar",
  reply: "bg-ember",
  agent: "bg-sweep-light",
  opt_out: "bg-[#b43c3c]",
};

function KpiCard({ label, value, sub, accent }: { label: string; value: number | string; sub: string; accent?: boolean }) {
  return (
    <div className="rounded-xl2 border border-line bg-white p-[22px] shadow-card">
      <p className="m-0 mb-3 text-[12.5px] font-medium text-[#888780]">{label}</p>
      <p className="m-0 mb-2 font-heading text-[34px] font-semibold tracking-[-1px] text-ink tabular-nums">{value}</p>
      <p className={`m-0 text-[12.5px] ${accent ? "font-medium text-ember" : "text-[#888780]"}`}>{sub}</p>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-md bg-charcoal-soft px-[11px] py-1.5 font-mono text-[12px] text-[#cdd2d6]">{children}</span>;
}
