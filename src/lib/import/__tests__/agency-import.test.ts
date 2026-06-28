import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { importLeadsForClient, resolveClientForAgency } from "@/lib/import/agency-import";

/**
 * Done-for-you agency import (M17). The load-bearing property is tenant
 * isolation: an agency admin may import only into a CLIENT they own. Importing
 * into a workspace under a DIFFERENT agency must be refused and write nothing.
 */
describe("agency done-for-you import", () => {
  const tag = `agcy-${Math.random().toString(36).slice(2, 8)}`;
  let agencyA: string;
  let clientC: string; // under agency A
  let agencyB: string;
  let clientX: string; // under agency B (foreign to A)

  const csvText = "Email,First\ndana@example.com,Dana\nphil@example.com,Phil\n";
  const columnMap = { email: "Email", firstName: "First" };

  beforeAll(async () => {
    const a = await prisma.org.create({ data: { name: `Agency A ${tag}`, slug: `agencya-${tag}`, type: "AGENCY" } });
    agencyA = a.id;
    const b = await prisma.org.create({ data: { name: `Agency B ${tag}`, slug: `agencyb-${tag}`, type: "AGENCY" } });
    agencyB = b.id;
    const c = await prisma.org.create({ data: { name: `Client C ${tag}`, slug: `clientc-${tag}`, type: "CLIENT", parentAgencyId: agencyA } });
    clientC = c.id;
    const x = await prisma.org.create({ data: { name: `Client X ${tag}`, slug: `clientx-${tag}`, type: "CLIENT", parentAgencyId: agencyB } });
    clientX = x.id;
  });

  afterAll(async () => {
    for (const id of [clientC, clientX, agencyA, agencyB]) {
      await prisma.lead.deleteMany({ where: { orgId: id } });
      await prisma.leadImport.deleteMany({ where: { orgId: id } });
      await prisma.suppressionEntry.deleteMany({ where: { orgId: id } });
      await prisma.auditLog.deleteMany({ where: { orgId: id } });
    }
    await prisma.org.deleteMany({ where: { id: { in: [clientC, clientX, agencyA, agencyB] } } });
    await prisma.$disconnect();
  });

  it("resolves a client of the agency, and refuses a foreign one", async () => {
    expect(await resolveClientForAgency(agencyA, clientC)).not.toBeNull();
    expect(await resolveClientForAgency(agencyA, clientX)).toBeNull(); // X belongs to agency B
  });

  it("imports leads into an owned client workspace", async () => {
    const res = await importLeadsForClient({
      agencyOrgId: agencyA,
      actorId: "agency-admin",
      clientOrgId: clientC,
      csvText,
      columnMap,
      name: "Concierge import",
      consentBasis: "PRIOR_INQUIRY",
      priorContactAttested: true,
    });
    expect(res.ok).toBe(true);
    expect(res.imported ?? 0).toBeGreaterThanOrEqual(1);
    expect(await prisma.lead.count({ where: { orgId: clientC } })).toBeGreaterThanOrEqual(1);
  });

  it("refuses to import into a workspace under another agency and writes nothing", async () => {
    const res = await importLeadsForClient({
      agencyOrgId: agencyA,
      actorId: "agency-admin",
      clientOrgId: clientX, // foreign
      csvText,
      columnMap,
      name: "Should not happen",
      consentBasis: "PRIOR_INQUIRY",
      priorContactAttested: true,
    });
    expect(res.ok).toBe(false);
    expect(await prisma.lead.count({ where: { orgId: clientX } })).toBe(0);
  });
});
