import { requireOrg } from "@/lib/auth-helpers";
import { orgScoped } from "@/lib/tenancy";
import { Topbar } from "@/components/nav/Topbar";
import { LeadFilters } from "@/components/leads/LeadFilters";
import { LeadsView, type LeadRow } from "@/components/leads/LeadsView";
import { leadFilterSchema } from "@/lib/zod/lead";
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
  if (activeStatus !== "all") where.status = activeStatus as LeadStatus;
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
  }));

  return (
    <>
      <Topbar title="Leads" />
      <div className="ws-rise flex-1 px-[34px] pb-[60px] pt-[30px]">
        <LeadFilters active={activeStatus} query={filter.q ?? ""} />
        <LeadsView leads={rows} />
      </div>
    </>
  );
}
