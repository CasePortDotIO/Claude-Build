import { prisma } from "@/lib/prisma";
import { resolveTier, readMeter, type PlanTier } from "@/lib/billing/entitlements";
import { QUALIFIED_BOOKING_STATUSES } from "@/lib/booking-status";

/**
 * Cross-org operator view for the superadmin console. Read-only summaries the
 * platform owner needs to run the 20: tier, billing state, usage headroom, trial
 * progress, and any open guarantee obligation. Actions live in
 * server/actions/admin.ts; this only reads.
 */

export interface AdminOrgVM {
  id: string;
  name: string;
  type: string;
  tier: PlanTier;
  planTierRaw: string | null;
  billingStatus: string;
  canceled: boolean;
  meter: { used: number; soft: number; hard: number; overSoft: boolean; atHardCap: boolean };
  trial: { active: boolean; threshold: number | null; booked: number; converted: boolean };
  guarantee: { creditMonths: number; refundDue: number };
  hasMailingAddress: boolean;
  hasRealMailbox: boolean;
  createdAt: Date;
}

export async function listOrgsForAdmin(): Promise<AdminOrgVM[]> {
  const orgs = await prisma.org.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true, name: true, brandName: true, type: true, planTier: true, billingStatus: true, canceledAt: true,
      leadsDraftedThisPeriod: true, meterPeriodStart: true,
      trialCallThreshold: true, trialStartedAt: true, trialConvertedAt: true,
      guaranteeCreditMonths: true, mailingAddress: true, createdAt: true,
    },
  });

  // One grouped pass each for the relational bits, keyed by orgId.
  const [refundDueRows, mailboxRows] = await Promise.all([
    prisma.guaranteeLedger.groupBy({ by: ["orgId"], where: { remedy: "REFUND_DUE" }, _count: { _all: true } }),
    prisma.mailbox.findMany({ where: { status: "CONNECTED", provider: { not: "SIMULATION" } }, select: { orgId: true }, distinct: ["orgId"] }),
  ]);
  const refundDue = new Map(refundDueRows.map((r) => [r.orgId, r._count._all]));
  const realMailbox = new Set(mailboxRows.map((m) => m.orgId));

  const now = new Date();
  const out: AdminOrgVM[] = [];
  for (const o of orgs) {
    const isTrial = o.billingStatus === "trial" && !o.trialConvertedAt;
    // Trial progress: qualified booked calls since the trial began (only when relevant).
    let booked = 0;
    if (isTrial && o.trialStartedAt) {
      booked = await prisma.booking.count({
        where: { orgId: o.id, status: { in: QUALIFIED_BOOKING_STATUSES }, createdAt: { gte: o.trialStartedAt } },
      });
    }
    const meter = readMeter(o, now);
    out.push({
      id: o.id,
      name: o.brandName || o.name,
      type: o.type,
      tier: resolveTier(o),
      planTierRaw: o.planTier,
      billingStatus: o.billingStatus,
      canceled: Boolean(o.canceledAt),
      meter: { used: meter.used, soft: meter.soft, hard: meter.hard, overSoft: meter.overSoft, atHardCap: meter.atHardCap },
      trial: { active: isTrial, threshold: o.trialCallThreshold, booked, converted: Boolean(o.trialConvertedAt) },
      guarantee: { creditMonths: o.guaranteeCreditMonths, refundDue: refundDue.get(o.id) ?? 0 },
      hasMailingAddress: Boolean(o.mailingAddress && o.mailingAddress.trim()),
      hasRealMailbox: realMailbox.has(o.id),
      createdAt: o.createdAt,
    });
  }
  return out;
}
