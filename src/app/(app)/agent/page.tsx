import { requireOrg } from "@/lib/auth-helpers";
import { orgScoped } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/nav/Topbar";
import { VoiceProfileCard, type VoiceVM } from "@/components/agent/VoiceProfileCard";
import { SelfImprovement, type InsightVM, type AbVM } from "@/components/agent/SelfImprovement";
import { defaultVoiceProfile } from "@/lib/agent/voice";
import { cohortStats, abLift } from "@/lib/agent/rollups";
import { agentMaturity, roiLedger } from "@/lib/retention";
import { AgentMaturityCard } from "@/components/magic/AgentMaturity";
import { timeAgo } from "@/lib/format";

const STEP_LABEL: Record<string, string> = {
  VOICE_LEARN: "Learned your voice",
  DRAFT: "Drafted a message",
  RESEARCH: "Researched a lead",
  REPLY: "Handled a reply",
  REFLECT: "Reflected on outcomes",
};

export default async function AgentPage() {
  const ctx = await requireOrg();
  const db = orgScoped(ctx.orgId);

  const [profile, sampleCount, memCount, draftCount, runs, insights, learning, cohorts] = await Promise.all([
    db.voiceProfile.find(),
    db.voiceSample.count(),
    db.memory.count(),
    db.draft.count(),
    db.agentRun.findMany({ orderBy: { createdAt: "desc" }, take: 12 }),
    prisma.insight.findMany({ where: { orgId: ctx.orgId }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.orgLearning.findUnique({ where: { orgId: ctx.orgId } }),
    cohortStats(ctx.orgId),
  ]);

  // M10: switching-cost made legible — the trained-agent score + ROI ledger.
  const [maturity, ledger] = await Promise.all([agentMaturity(ctx.orgId), roiLedger(ctx.orgId)]);

  const insightVMs: InsightVM[] = insights.map((i) => ({
    id: i.id,
    kind: i.kind,
    status: i.status,
    title: i.title,
    body: i.body,
    metric: i.metric,
    when: timeAgo(i.appliedAt ?? i.createdAt),
    informational: i.kind === "AB_RESULT",
  }));

  const lift = abLift(cohorts);
  const ab: AbVM | null = lift.treatment
    ? {
        liftPct: lift.liftPct,
        treatmentRate: lift.treatment.replyRate,
        holdoutRate: lift.holdout?.replyRate ?? 0,
        treatmentN: lift.treatment.contacted,
        holdoutN: lift.holdout?.contacted ?? 0,
      }
    : null;

  const def = defaultVoiceProfile();
  const voice: VoiceVM = {
    tone: profile?.tone ?? def.tone,
    sentenceLength: profile?.sentenceLength ?? def.sentenceLength,
    emojiUse: profile?.emojiUse ?? def.emojiUse,
    greeting: profile?.greeting ?? def.greeting,
    signOff: profile?.signOff ?? def.signOff,
    signatureMove: profile?.signatureMove ?? def.signatureMove,
    summary: profile?.summary ?? null,
    sampleCount: profile?.sampleCount ?? 0,
    source: profile?.source ?? "default",
  };

  const totalCost = runs.reduce((s, r) => s + r.costUsd, 0);

  return (
    <>
      <Topbar title="The Agent" subtitle="Your voice and what it's learning" />
      <div className="ws-rise max-w-[1000px] flex-1 px-4 pb-[60px] pt-[30px] sm:px-6 lg:px-[34px]">
        {/* M10: trained-agent maturity score + ROI ledger — the switching cost */}
        <AgentMaturityCard maturity={maturity} ledger={ledger} />

        {/* identity */}
        <div className="mb-[18px] flex flex-wrap items-center gap-[22px] rounded-xl2 bg-charcoal p-8">
          <div className="flex h-16 w-16 flex-none items-center justify-center rounded-2xl bg-[rgba(92,169,138,0.14)]">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#5CA98A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8" />
              <circle cx="12" cy="12" r="3.2" />
            </svg>
          </div>
          <div className="min-w-[220px] flex-1">
            <p className="m-0 mb-1 font-heading text-[22px] font-semibold text-white">Your Warm Sweep Agent</p>
            <p className="m-0 text-[14px] leading-[1.5] text-on-dark-soft">
              Trained on your voice and your list. It drafts every re-engagement email grounded in real memory — and
              waits for your approval before anything sends.
            </p>
          </div>
          <div className="flex-none text-center">
            <p className="m-0 font-heading text-[30px] font-semibold text-sweep-light tabular-nums">v{learning?.version ?? 1}</p>
            <p className="m-0 text-[11.5px] text-on-dark-mute">self-updates</p>
          </div>
        </div>

        {/* memory stats */}
        <div className="mb-[18px] grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat value={voice.sampleCount} label="voice samples" />
          <Stat value={memCount} label="memory embeddings" />
          <Stat value={draftCount} label="drafts generated" green />
          <Stat value={`$${totalCost.toFixed(4)}`} label="agent spend (logged)" />
        </div>

        {/* voice profile */}
        <div className="mb-[18px]">
          <VoiceProfileCard voice={voice} />
        </div>

        {/* self-improvement: A/B holdout + proposed changes + what it taught itself */}
        <div className="mb-[18px]">
          <SelfImprovement
            insights={insightVMs}
            ab={ab}
            learning={{
              bestSendHour: learning?.bestSendHour ?? null,
              retiredPhrases: learning?.retiredPhrases ?? [],
              version: learning?.version ?? 1,
              lastReflection: learning?.lastReflectionAt ? timeAgo(learning.lastReflectionAt) : null,
            }}
          />
        </div>

        {/* what it did (agent runs / raw audit log) */}
        <div className="rounded-xl2 border border-line bg-white p-7">
          <p className="m-0 mb-5 text-[12px] font-semibold uppercase tracking-[1.6px] text-muted-2">
            What it did · agent run log
          </p>
          {runs.length === 0 ? (
            <p className="m-0 text-[14px] text-muted">
              No runs yet. Learn your voice and generate drafts to see the agent&apos;s decisions — every step is
              logged here with tokens and cost for full auditability.
            </p>
          ) : (
            <div className="flex flex-col">
              {runs.map((r) => (
                <div key={r.id} className="flex gap-4 border-b border-line-2 py-3 last:border-b-0">
                  <div className="mt-1 h-2.5 w-2.5 flex-none rounded-full bg-sweep" />
                  <div className="flex-1">
                    <div className="flex justify-between gap-3">
                      <p className="m-0 font-heading text-[14.5px] font-semibold text-ink">
                        {STEP_LABEL[r.step] ?? r.step}
                      </p>
                      <span className="flex-none text-[12px] text-muted-3">{timeAgo(r.createdAt)}</span>
                    </div>
                    <p className="m-0 mt-0.5 text-[13px] text-muted">{r.inputSummary}</p>
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      <Tag>{r.provider} · {r.model}</Tag>
                      <Tag>{r.promptTokens + r.completionTokens} tokens</Tag>
                      {r.costUsd > 0 && <Tag>${r.costUsd.toFixed(4)}</Tag>}
                      <Tag>{r.latencyMs}ms</Tag>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function Stat({ value, label, green }: { value: number | string; label: string; green?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-cream px-4 py-4">
      <p className={`m-0 font-heading text-[23px] font-semibold tabular-nums ${green ? "text-sweep" : "text-ink"}`}>{value}</p>
      <p className="m-0 mt-1 text-[12px] text-muted">{label}</p>
    </div>
  );
}
function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md bg-cream-head px-2 py-1 font-mono text-[11px] text-muted-2">{children}</span>
  );
}
