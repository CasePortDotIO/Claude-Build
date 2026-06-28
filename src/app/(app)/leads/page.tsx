import { requireOrg } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { orgScoped } from "@/lib/tenancy";
import { Topbar } from "@/components/nav/Topbar";
import { LeadFilters } from "@/components/leads/LeadFilters";
import { LeadsView, type LeadRow, type DraftPreview } from "@/components/leads/LeadsView";
import { leadFilterSchema } from "@/lib/zod/lead";
import { LEAD_STATUS_ORDER } from "@/lib/types";
import { timeAgo } from "@/lib/format";
import type { Prisma, LeadStatus } from "@prisma/client";

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const ctx = await requireOrg();
  const db = orgScoped(ctx.orgId);

  const sp = await searchParams;
  const filter = leadFilterSchema.parse({ status: sp.status, q: sp.q });
  const activeStatus = filter.status ?? "all";

  const where: Prisma.LeadWhereInput = {};
  // Only apply a status filter when it's a real LeadStatus — a hand-crafted
  // ?status=foo is ignored rather than throwing a Prisma validation 500.
  if (activeStatus !== "all" && LEAD_STATUS_ORDER.includes(activeStatus as LeadStatus)) {
    where.status = activeStatus as LeadStatus;
  }
  if (filter.q) {
    where.OR = [
      { email: { contains: filter.q, mode: "insensitive" } },
      { firstName: { contains: filter.q, mode: "insensitive" } },
      { lastName: { contains: filter.q, mode: "insensitive" } },
      { company: { contains: filter.q, mode: "insensitive" } },
    ];
  }

  const leads = await db.lead.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  // Fetch the latest non-superseded draft per lead on screen, for the drawer.
  const leadIds = leads.map((l) => l.id);
  const draftRows = leadIds.length
    ? await prisma.draft.findMany({
        where: { orgId: ctx.orgId, leadId: { in: leadIds }, status: { in: ["PENDING_APPROVAL", "APPROVED"] } },
        orderBy: { createdAt: "desc" },
        include: {
          variants: { orderBy: { index: "asc" } },
          agentRun: { select: { provider: true } },
        },
      })
    : [];

  const drafts: Record<string, DraftPreview> = {};
  for (const d of draftRows) {
    if (drafts[d.leadId]) continue; // keep the most recent only
    const v = d.variants.find((x) => x.id === d.selectedVariantId) ?? d.variants[0];
    if (!v) continue;
    drafts[d.leadId] = {
      status: d.status,
      angle: v.angle,
      confidence: v.confidence,
      subject: d.finalSubject ?? v.subject,
      body: d.finalBody ?? v.body,
      provider: d.agentRun?.provider ?? "stub",
    };
  }

  const rows: LeadRow[] = leads.map((l) => ({
    id: l.id,
    email: l.email,
    firstName: l.firstName,
    lastName: l.lastName,
    company: l.company,
    status: l.status,
    originalInquiry: l.originalInquiry,
    statedGoal: l.statedGoal,
    toneRead: l.toneRead,
    bestChannel: l.bestChannel,
    region: l.region,
    consentBasis: l.consentBasis,
    source: l.source,
    coldFor: timeAgo(l.lastTouchAt ?? l.createdAt),
    objections: l.objections ?? [],
  }));

  return (
    <>
      <Topbar title="Leads" subtitle="Every prior contact and where they stand" />
      <div className="ws-rise flex-1 px-[34px] pb-[60px] pt-[30px]">
        <LeadFilters active={activeStatus} query={filter.q ?? ""} />
        <LeadsView leads={rows} drafts={drafts} />
      </div>
    </>
  );
}
