import { requireOrg } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/nav/Topbar";
import { ApprovalQueue, type DraftVM } from "@/components/approvals/ApprovalQueue";
import { ReadyToSend, type ReadyItem } from "@/components/approvals/ReadyToSend";

export default async function ApprovalsPage() {
  const ctx = await requireOrg();

  // Approved-but-unsent drafts (the irreversible send step lives here).
  const [readyDrafts, mailboxCount, org] = await Promise.all([
    prisma.draft.findMany({
      where: { orgId: ctx.orgId, status: "APPROVED", messages: { none: { direction: "OUTBOUND" } } },
      orderBy: { approvedAt: "asc" },
      include: { lead: { select: { firstName: true, lastName: true, email: true } } },
    }),
    prisma.mailbox.count({ where: { orgId: ctx.orgId, status: "CONNECTED" } }),
    prisma.org.findUnique({ where: { id: ctx.orgId }, select: { autopilotApprove: true } }),
  ]);
  const autoSend = org?.autopilotApprove ?? false;
  const readyItems: ReadyItem[] = readyDrafts.map((d) => ({
    draftId: d.id,
    leadName: [d.lead.firstName, d.lead.lastName].filter(Boolean).join(" ") || d.lead.email,
    subject: d.finalSubject ?? "(no subject)",
  }));

  // Include-heavy read: query directly but always scope by orgId.
  const drafts = await prisma.draft.findMany({
    where: { orgId: ctx.orgId, status: "PENDING_APPROVAL" },
    orderBy: { createdAt: "desc" },
    include: {
      lead: { select: { firstName: true, lastName: true, email: true, statedGoal: true } },
      variants: { orderBy: { index: "asc" } },
      agentRun: { select: { provider: true, model: true } },
    },
  });

  const vms: DraftVM[] = drafts.map((d) => ({
    id: d.id,
    leadName: [d.lead.firstName, d.lead.lastName].filter(Boolean).join(" ") || d.lead.email,
    leadEmail: d.lead.email,
    leadGoal: d.lead.statedGoal,
    selectedVariantId: d.selectedVariantId,
    provider: d.agentRun?.provider ?? "stub",
    model: d.agentRun?.model ?? "—",
    variants: d.variants.map((v) => ({
      id: v.id,
      index: v.index,
      angle: v.angle,
      subject: v.subject,
      body: v.body,
      confidence: v.confidence,
      rationale: v.rationale,
      voiceMatch: v.voiceMatch,
      voiceEcho: v.voiceEcho,
    })),
  }));

  return (
    <>
      <Topbar title="Approvals" subtitle="Review drafts before anything sends" />
      <div className="ws-rise flex-1 px-4 pb-[60px] pt-[30px] sm:px-6 lg:px-[34px]">
        {autoSend ? (
          <div className="mb-5 flex max-w-[760px] items-start gap-3 rounded-xl2 border border-[rgba(232,116,59,0.25)] bg-[rgba(232,116,59,0.05)] p-4 shadow-card">
            <span className="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-full bg-ember/15 text-ember" aria-hidden>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
            </span>
            <p className="m-0 text-[13px] leading-[1.5] text-ink-soft">
              <span className="font-semibold text-ink">Auto-send is on.</span> The agent sends confident drafts
              automatically — only the ones it wants a second opinion on land here. Manage this under{" "}
              <a href="/connections" className="font-semibold text-ember hover:underline">Connections → Autopilot</a>.
            </p>
          </div>
        ) : (
          <p className="mb-5 max-w-[640px] text-[14px] leading-[1.6] text-muted">
            Every message waits for you. Edit, switch variants, approve, or reject — nothing leaves your mailbox
            without a click.
          </p>
        )}
        <ReadyToSend items={readyItems} hasMailbox={mailboxCount > 0} />
        <ApprovalQueue drafts={vms} />
      </div>
    </>
  );
}
