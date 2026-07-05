import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { ensureGuaranteeWindow, evaluateGuarantees } from "@/lib/guarantee";

const DAY = 86_400_000;

/**
 * The guarantee engine as a real subsystem: windows open for paying orgs, settle
 * to MET/MISSED on qualified booked calls, and apply the remedy on a miss.
 */
describe("guarantee engine", () => {
  const tag = `gtee-eng-${Math.random().toString(36).slice(2, 8)}`;
  const orgIds: string[] = [];

  async function makeOrg(over: Record<string, unknown>): Promise<string> {
    const o = await prisma.org.create({
      data: { name: `Org ${tag}-${orgIds.length}`, slug: `org-${tag}-${orgIds.length}`, type: "CLIENT", ...over },
    });
    orgIds.push(o.id);
    return o.id;
  }

  async function qualifiedBooking(orgId: string, leadId: string, at: Date) {
    return prisma.booking.create({
      data: {
        orgId,
        leadId,
        status: "CONFIRMED",
        startsAt: at,
        endsAt: new Date(at.getTime() + 30 * 60_000),
        attendeeEmail: `a-${tag}@x.com`,
        createdAt: at,
      },
    });
  }

  async function leadFor(orgId: string): Promise<string> {
    return (await prisma.lead.create({ data: { orgId, email: `l-${tag}-${Math.random().toString(36).slice(2, 6)}@x.com` } })).id;
  }

  beforeAll(async () => {});
  afterAll(async () => {
    for (const id of orgIds) await prisma.org.delete({ where: { id } }).catch(() => {});
  });

  it("opens a window for a paying continuity org, and skips non-paying orgs", async () => {
    const paying = await makeOrg({ billingStatus: "active", planTier: "CONTINUITY" });
    const trialing = await makeOrg({ billingStatus: "trial", planTier: "CONTINUITY" });

    await ensureGuaranteeWindow(paying);
    await ensureGuaranteeWindow(trialing);

    const w = await prisma.guaranteeLedger.findFirst({ where: { orgId: paying, status: "ACTIVE" } });
    expect(w?.type).toBe("FIVE_CALL_MONTH");
    expect(w?.threshold).toBe(5);
    // The $0 trial is leg 1 (no pay until 3 calls) — the monthly guarantee only
    // starts once they're paying.
    expect(await prisma.guaranteeLedger.count({ where: { orgId: trialing } })).toBe(0);

    // Idempotent — a second call doesn't stack a window.
    await ensureGuaranteeWindow(paying);
    expect(await prisma.guaranteeLedger.count({ where: { orgId: paying, status: "ACTIVE" } })).toBe(1);
  });

  it("settles a met window and reopens the next month", async () => {
    const now = new Date("2026-06-30T12:00:00Z");
    const orgId = await makeOrg({ billingStatus: "active", planTier: "CONTINUITY" });
    const leadId = await leadFor(orgId);
    const start = new Date(now.getTime() - 31 * DAY);
    const end = new Date(now.getTime() - DAY); // window already closed
    const window = await prisma.guaranteeLedger.create({
      data: { orgId, type: "FIVE_CALL_MONTH", threshold: 5, periodStart: start, periodEnd: end },
    });
    for (let i = 0; i < 5; i++) await qualifiedBooking(orgId, leadId, new Date(now.getTime() - 15 * DAY));

    await evaluateGuarantees(now);

    const settled = await prisma.guaranteeLedger.findUnique({ where: { id: window.id } });
    expect(settled?.status).toBe("MET");
    expect(settled?.bookedCount).toBe(5);
    // Recurring → a fresh window is open again.
    expect(await prisma.guaranteeLedger.count({ where: { orgId, status: "ACTIVE" } })).toBe(1);
  });

  it("misses a window → credits a free month and keeps running", async () => {
    const now = new Date("2026-06-30T12:00:00Z");
    const orgId = await makeOrg({ billingStatus: "active", planTier: "CONTINUITY" });
    const leadId = await leadFor(orgId);
    const start = new Date(now.getTime() - 31 * DAY);
    const end = new Date(now.getTime() - DAY);
    const window = await prisma.guaranteeLedger.create({
      data: { orgId, type: "FIVE_CALL_MONTH", threshold: 5, periodStart: start, periodEnd: end },
    });
    await qualifiedBooking(orgId, leadId, new Date(now.getTime() - 10 * DAY)); // only 1 of 5

    await evaluateGuarantees(now);

    const settled = await prisma.guaranteeLedger.findUnique({ where: { id: window.id } });
    expect(settled?.status).toBe("MISSED");
    expect(settled?.remedy).toBe("FREE_MONTH");
    const org = await prisma.org.findUnique({ where: { id: orgId }, select: { guaranteeCreditMonths: true } });
    expect(org?.guaranteeCreditMonths).toBe(1); // a free month is owed
    // Still recurring — a new window opened so the agent keeps working.
    expect(await prisma.guaranteeLedger.count({ where: { orgId, status: "ACTIVE" } })).toBe(1);
  });
});
