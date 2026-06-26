import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { orgScoped } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";

/**
 * The most important test in M1: prove a tenant cannot read or write across the
 * org boundary when all access goes through orgScoped(). Runs against the real
 * dev database (DATABASE_URL must point at a reachable Postgres).
 */
describe("tenancy isolation", () => {
  let orgA: string;
  let orgB: string;
  const tag = `test-${Math.random().toString(36).slice(2, 8)}`;

  beforeAll(async () => {
    const a = await prisma.org.create({ data: { name: `A ${tag}`, slug: `a-${tag}`, type: "CLIENT" } });
    const b = await prisma.org.create({ data: { name: `B ${tag}`, slug: `b-${tag}`, type: "CLIENT" } });
    orgA = a.id;
    orgB = b.id;
    await orgScoped(orgA).lead.create({ data: { email: `a-lead@${tag}.com`, status: "NEW" } });
    await orgScoped(orgB).lead.create({ data: { email: `b-lead@${tag}.com`, status: "NEW" } });
  });

  afterAll(async () => {
    await prisma.lead.deleteMany({ where: { orgId: { in: [orgA, orgB] } } });
    await prisma.org.deleteMany({ where: { id: { in: [orgA, orgB] } } });
    await prisma.$disconnect();
  });

  it("org A sees only its own lead", async () => {
    const leads = await orgScoped(orgA).lead.findMany();
    expect(leads).toHaveLength(1);
    expect(leads[0].email).toBe(`a-lead@${tag}.com`);
  });

  it("org B cannot see org A's lead by any filter", async () => {
    const viaScope = orgScoped(orgB);
    // Even explicitly querying org A's email through B's scope returns nothing.
    const stolen = await viaScope.lead.findFirst({ where: { email: `a-lead@${tag}.com` } });
    expect(stolen).toBeNull();
    expect(await viaScope.lead.count()).toBe(1);
  });

  it("a guarded update from org B does not touch org A's rows", async () => {
    const res = await orgScoped(orgB).lead.updateMany({
      where: { email: `a-lead@${tag}.com` },
      data: { status: "BOOKED" },
    });
    expect(res.count).toBe(0); // matched nothing in B's scope

    const aLead = await orgScoped(orgA).lead.findFirst();
    expect(aLead?.status).toBe("NEW"); // untouched
  });

  it("writes always stamp the scoping orgId, ignoring caller-supplied org", async () => {
    // The create signature omits orgId by type, but prove the row lands in B.
    const created = await orgScoped(orgB).lead.create({ data: { email: `b2-${tag}@x.com`, status: "NEW" } });
    expect(created.orgId).toBe(orgB);
  });
});
