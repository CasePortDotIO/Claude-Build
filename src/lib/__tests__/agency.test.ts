import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { agencyRollup, agencyForUser } from "@/lib/agency";
import { resolveBranding } from "@/lib/branding";
import { assertRole } from "@/lib/roles";

/**
 * DB-backed reseller test: an agency's roll-up sums only ITS clients' metrics,
 * never another agency's; plus brand resolution + role enforcement.
 */
describe("reseller / white-label", () => {
  const tag = `ag-${Math.random().toString(36).slice(2, 8)}`;
  let agencyA: string;
  let agencyB: string;
  let clientA1: string;
  let adminId: string;

  beforeAll(async () => {
    const a = await prisma.org.create({ data: { name: `Agency A ${tag}`, slug: `aa-${tag}`, type: "AGENCY" } });
    const b = await prisma.org.create({ data: { name: `Agency B ${tag}`, slug: `ab-${tag}`, type: "AGENCY" } });
    agencyA = a.id;
    agencyB = b.id;
    const admin = await prisma.user.create({ data: { email: `admin@${tag}.com`, name: "Admin" } });
    adminId = admin.id;
    await prisma.membership.create({ data: { userId: adminId, orgId: agencyA, role: "AGENCY_ADMIN" } });

    // Agency A: two clients with revenue. Agency B: one client.
    const c1 = await prisma.org.create({ data: { name: `A-Client1 ${tag}`, slug: `ac1-${tag}`, type: "CLIENT", parentAgencyId: agencyA, clientPriceCents: 49700, billingStatus: "active" } });
    const c2 = await prisma.org.create({ data: { name: `A-Client2 ${tag}`, slug: `ac2-${tag}`, type: "CLIENT", parentAgencyId: agencyA, clientPriceCents: 29700, billingStatus: "trial" } });
    const c3 = await prisma.org.create({ data: { name: `B-Client1 ${tag}`, slug: `bc1-${tag}`, type: "CLIENT", parentAgencyId: agencyB, clientPriceCents: 99700, billingStatus: "active" } });
    clientA1 = c1.id;

    // A booking in each client → recovered revenue.
    const lead1 = await prisma.lead.create({ data: { orgId: c1.id, email: `l1@${tag}.com`, status: "BOOKED", dealValueCents: 200000 } });
    await prisma.booking.create({ data: { orgId: c1.id, leadId: lead1.id, status: "CONFIRMED", startsAt: new Date(), endsAt: new Date(), attendeeEmail: lead1.email, valueCents: 200000 } });
    const lead3 = await prisma.lead.create({ data: { orgId: c3.id, email: `l3@${tag}.com`, status: "BOOKED", dealValueCents: 999999 } });
    await prisma.booking.create({ data: { orgId: c3.id, leadId: lead3.id, status: "CONFIRMED", startsAt: new Date(), endsAt: new Date(), attendeeEmail: lead3.email, valueCents: 999999 } });
  });

  afterAll(async () => {
    const clients = await prisma.org.findMany({ where: { parentAgencyId: { in: [agencyA, agencyB] } }, select: { id: true } });
    const ids = clients.map((c) => c.id);
    await prisma.booking.deleteMany({ where: { orgId: { in: ids } } });
    await prisma.lead.deleteMany({ where: { orgId: { in: ids } } });
    await prisma.membership.deleteMany({ where: { userId: adminId } });
    await prisma.org.deleteMany({ where: { id: { in: ids } } });
    await prisma.org.deleteMany({ where: { id: { in: [agencyA, agencyB] } } });
    await prisma.user.deleteMany({ where: { id: adminId } });
    await prisma.$disconnect();
  });

  it("rolls up only this agency's clients, isolated from other agencies", async () => {
    const rollup = await agencyRollup(agencyA);
    expect(rollup.clientCount).toBe(2);
    expect(rollup.totalRecoveredCents).toBe(200000); // only A-Client1's booking, NOT B's 999999
    expect(rollup.totalCalls).toBe(1);
    // Margin counts only active-billing clients (c1 active, c2 trial).
    expect(rollup.monthlyMarginCents).toBe(49700);
  });

  it("resolves the admin's agency from any active org, and denies non-admins", async () => {
    // admin, active org IS the agency → returns it
    expect((await agencyForUser(adminId, agencyA))?.id).toBe(agencyA);
    // admin, active org is a client → still finds their agency (cross-membership)
    expect((await agencyForUser(adminId, clientA1))?.id).toBe(agencyA);
    // a non-admin gets nothing, even with the agency active (authorization gate)
    expect(await agencyForUser("nobody", agencyA)).toBeNull();
  });

  it("white-label branding hides the product name for branded clients", () => {
    const branded = resolveBranding({ name: "Apex", brandName: "Apex Fitness", brandColor: "#123456", type: "CLIENT" }, "by Agency A");
    expect(branded.whiteLabel).toBe(true);
    expect(branded.name).toBe("Apex Fitness");
    expect(branded.name).not.toMatch(/Warm Sweep/);

    const def = resolveBranding({ name: "Solo", brandName: null, brandColor: null, type: "CLIENT" });
    expect(def.whiteLabel).toBe(false);
    expect(def.name).toMatch(/Warm Sweep/);
  });

  it("assertRole enforces the role hierarchy", () => {
    const member = { userId: "u", orgId: "o", role: "MEMBER" as const, email: "", name: null };
    const agencyAdmin = { ...member, role: "AGENCY_ADMIN" as const };
    expect(() => assertRole(member, "AGENCY_ADMIN")).toThrow();
    expect(() => assertRole(agencyAdmin, "CLIENT_ADMIN")).not.toThrow(); // higher covers lower
  });
});
