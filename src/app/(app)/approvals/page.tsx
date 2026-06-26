import { requireOrg } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/nav/Topbar";
import { ApprovalQueue, type DraftVM } from "@/components/approvals/ApprovalQueue";

export default async function ApprovalsPage() {
  const ctx = await requireOrg();

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
    })),
  }));

  return (
    <>
      <Topbar title="Approvals" />
      <div className="ws-rise flex-1 px-[34px] pb-[60px] pt-[30px]">
        <p className="mb-5 max-w-[640px] text-[14px] leading-[1.6] text-muted">
          Every message waits for you. Edit, switch variants, approve, or reject — nothing leaves your mailbox
          without a click. (v1 default: preview &amp; approve.)
        </p>
        <ApprovalQueue drafts={vms} />
      </div>
    </>
  );
}
