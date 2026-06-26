import { prisma } from "@/lib/prisma";
import { commandCenterKpis } from "@/lib/metrics";

/**
 * Reseller roll-up (§10). Aggregates each client org's real metrics under an
 * agency — strictly the clients of THIS agency, so one reseller never sees
 * another's book. Per-client data stays isolated; this only sums what the
 * agency is already entitled to.
 */

export interface ClientRow {
  orgId: string;
  name: string;
  brandName: string | null;
  brandColor: string | null;
  recoveredRevenueCents: number;
  callsBooked: number;
  replyRate: number;
  activeConversations: number;
  leadCount: number;
  clientPriceCents: number;
  billingStatus: string;
}

export interface AgencyRollup {
  agencyId: string;
  agencyName: string;
  clientCount: number;
  totalRecoveredCents: number;
  totalCalls: number;
  monthlyMarginCents: number; // sum of what the agency charges its clients
  clients: ClientRow[];
}

/**
 * The agency org a user administers. Prefers the active org when it's an agency
 * the user admins; otherwise any agency where they're AGENCY_ADMIN. Returns null
 * if they administer no agency — which is the authorization gate for all
 * reseller actions (so it works regardless of which client is currently active).
 */
export async function agencyForUser(userId: string, activeOrgId: string) {
  const active = await prisma.org.findUnique({ where: { id: activeOrgId } });
  if (active?.type === "AGENCY") {
    const adminHere = await prisma.membership.findUnique({
      where: { userId_orgId: { userId, orgId: active.id } },
    });
    if (adminHere?.role === "AGENCY_ADMIN") return active;
  }
  const m = await prisma.membership.findFirst({
    where: { userId, role: "AGENCY_ADMIN", org: { type: "AGENCY" } },
    include: { org: true },
  });
  return m?.org ?? null;
}

export async function agencyRollup(agencyId: string): Promise<AgencyRollup> {
  const agency = await prisma.org.findUniqueOrThrow({ where: { id: agencyId } });
  const clients = await prisma.org.findMany({ where: { parentAgencyId: agencyId, type: "CLIENT" }, orderBy: { createdAt: "asc" } });

  const rows: ClientRow[] = await Promise.all(
    clients.map(async (c) => {
      const [kpis, leadCount] = await Promise.all([
        commandCenterKpis(c.id),
        prisma.lead.count({ where: { orgId: c.id } }),
      ]);
      return {
        orgId: c.id,
        name: c.name,
        brandName: c.brandName,
        brandColor: c.brandColor,
        recoveredRevenueCents: kpis.recoveredRevenueCents,
        callsBooked: kpis.callsBooked,
        replyRate: kpis.replyRate,
        activeConversations: kpis.activeConversations,
        leadCount,
        clientPriceCents: c.clientPriceCents,
        billingStatus: c.billingStatus,
      };
    }),
  );

  return {
    agencyId,
    agencyName: agency.brandName || agency.name,
    clientCount: rows.length,
    totalRecoveredCents: rows.reduce((n, r) => n + r.recoveredRevenueCents, 0),
    totalCalls: rows.reduce((n, r) => n + r.callsBooked, 0),
    monthlyMarginCents: rows.filter((r) => r.billingStatus === "active").reduce((n, r) => n + r.clientPriceCents, 0),
    clients: rows,
  };
}
