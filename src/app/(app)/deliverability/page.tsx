import { requireOrg } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/nav/Topbar";
import { deliverabilitySummary } from "@/lib/compliance/deliverability";
import { DeliverabilityClient, type MailboxHealthVM, type SuppressionVM } from "@/components/deliverability/DeliverabilityClient";
import { timeAgo } from "@/lib/format";

export default async function DeliverabilityPage() {
  const ctx = await requireOrg();
  const [summary, suppressions, org] = await Promise.all([
    deliverabilitySummary(ctx.orgId),
    prisma.suppressionEntry.findMany({ where: { orgId: ctx.orgId }, orderBy: { createdAt: "desc" }, take: 25 }),
    prisma.org.findUnique({ where: { id: ctx.orgId }, select: { mailingAddress: true } }),
  ]);

  const mailboxVMs: MailboxHealthVM[] = summary.mailboxes.map((m) => ({
    id: m.id,
    email: m.email,
    status: m.status,
    pausedReason: m.pausedReason,
    sentToday: m.sentToday,
    effectiveDailyCap: m.effectiveDailyCap === Infinity ? m.dailyCap : m.effectiveDailyCap,
    dailyCap: m.dailyCap,
    hourlyCap: m.hourlyCap,
    warmupDay: m.warmupDay,
    warming: m.warming,
    bounceRatePct: m.bounceRatePct,
  }));
  const suppressionVMs: SuppressionVM[] = suppressions.map((s) => ({ email: s.email, reason: s.reason, when: timeAgo(s.createdAt) }));

  const ring = 402;
  const offset = ring - (summary.healthScore / 100) * ring;
  const authItems = [
    { label: "SPF", on: summary.auth.spf, note: summary.auth.checked ? "" : "set a sending domain" },
    { label: "DMARC", on: summary.auth.dmarc, note: summary.auth.checked ? "" : "set a sending domain" },
    { label: "DKIM", on: summary.auth.dkim, note: "verify your provider selector" },
  ];

  return (
    <>
      <Topbar title="Deliverability" />
      <div className="ws-rise max-w-[1000px] flex-1 px-[34px] pb-[60px] pt-[30px]">
        {/* health + metrics */}
        <div className="mb-[18px] grid grid-cols-1 gap-[18px] lg:grid-cols-[0.9fr_1.4fr]">
          <div className="flex flex-col items-center justify-center rounded-xl2 bg-charcoal p-8 text-center">
            <p className="m-0 mb-5 text-[12px] font-semibold uppercase tracking-[1.6px] text-on-dark-mute">Sender health</p>
            <div className="relative mx-auto mb-4 h-[150px] w-[150px]">
              <svg width="150" height="150" viewBox="0 0 150 150" style={{ transform: "rotate(-90deg)" }}>
                <circle cx="75" cy="75" r="64" fill="none" stroke="#262b30" strokeWidth="14" />
                <circle cx="75" cy="75" r="64" fill="none" stroke="#5CA98A" strokeWidth="14" strokeLinecap="round" strokeDasharray={ring} strokeDashoffset={offset} />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-heading text-[40px] font-semibold leading-none text-white">{summary.healthScore}</span>
                <span className="text-[12px] text-on-dark-mute">{summary.healthLabel}</span>
              </div>
            </div>
            <p className="m-0 text-[13.5px] leading-[1.5] text-on-dark-soft">
              Computed from real bounce/complaint rates, domain auth, and warmup — not a vanity score.
            </p>
          </div>

          <div className="rounded-xl2 border border-line bg-white p-6">
            <p className="m-0 mb-5 text-[12px] font-semibold uppercase tracking-[1.6px] text-muted-2">The rails protecting you</p>
            <div className="grid grid-cols-2 gap-x-8 gap-y-5">
              <Metric label="Inbox placement (est.)" value={`${summary.inboxPlacementPct}%`} good />
              <Metric label="Bounce rate" value={`${summary.bounceRatePct}%`} />
              <Metric label="Spam-complaint rate" value={`${summary.complaintRatePct}%`} />
              <Metric label="Suppressed contacts" value={String(summary.suppressionCount)} />
            </div>
            <div className="mt-5 flex flex-col gap-2.5 border-t border-line-2 pt-5">
              {authItems.map((a) => (
                <div key={a.label} className="flex items-center gap-2.5">
                  <span className={`flex h-5 w-5 flex-none items-center justify-center rounded-full text-[11px] font-bold ${a.on ? "bg-[rgba(27,122,87,0.1)] text-sweep" : "bg-line-2 text-muted-2"}`}>
                    {a.on ? "✓" : "•"}
                  </span>
                  <span className="text-[14px] text-ink-soft">{a.label} {a.on ? "verified" : "not verified"}</span>
                  {a.note && <span className="text-[12px] text-muted-3">— {a.note}</span>}
                </div>
              ))}
            </div>
          </div>
        </div>

        <DeliverabilityClient
          mailboxes={mailboxVMs}
          suppressions={suppressionVMs}
          suppressionCount={summary.suppressionCount}
          hasMailingAddress={Boolean(org?.mailingAddress)}
        />
      </div>
    </>
  );
}

function Metric({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div>
      <p className="m-0 mb-1 text-[13px] text-muted-2">{label}</p>
      <p className={`m-0 font-heading text-[24px] font-semibold ${good ? "text-sweep" : "text-ink"}`}>{value}</p>
    </div>
  );
}
