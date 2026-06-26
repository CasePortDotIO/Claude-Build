import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";

/**
 * Integration test for the import pipeline's pure decisions: prior-contact gate,
 * server-side re-parse + mapping, and filtering against suppression + existing
 * leads. We exercise the building blocks directly (the server action wires them
 * to an authenticated org; auth is covered separately) to keep this DB-focused.
 */
import { parseCsv } from "@/lib/import/csv";
import { applyMapping } from "@/lib/import/mapping";
import { assertPriorContact, PriorContactError } from "@/lib/import/prior-contact-gate";
import { orgScoped } from "@/lib/tenancy";

const tag = `imp-${Math.random().toString(36).slice(2, 8)}`;
let orgId: string;

beforeAll(async () => {
  const org = await prisma.org.create({ data: { name: `Imp ${tag}`, slug: `imp-${tag}`, type: "CLIENT" } });
  orgId = org.id;
  // Pre-seed one existing lead + one suppression to prove filtering.
  await orgScoped(orgId).lead.create({ data: { email: `existing@${tag}.com`, status: "NEW" } });
  await prisma.suppressionEntry.create({
    data: { orgId, email: `blocked@${tag}.com`, reason: "OPTED_OUT" },
  });
});

afterAll(async () => {
  await prisma.lead.deleteMany({ where: { orgId } });
  await prisma.suppressionEntry.deleteMany({ where: { orgId } });
  await prisma.leadImport.deleteMany({ where: { orgId } });
  await prisma.org.deleteMany({ where: { id: orgId } });
  await prisma.$disconnect();
});

describe("import pipeline", () => {
  it("blocks import when prior contact is not attested", () => {
    expect(() => assertPriorContact({ attested: false, consentBasis: "PRIOR_INQUIRY" })).toThrow(
      PriorContactError,
    );
  });

  it("imports only fresh, non-suppressed, non-duplicate leads", async () => {
    const csv =
      "Email,First\n" +
      `fresh1@${tag}.com,Ann\n` +
      `fresh2@${tag}.com,Bob\n` +
      `existing@${tag}.com,Dup\n` + // already in DB
      `blocked@${tag}.com,Nope\n` + // suppressed
      "not-an-email,Bad\n";

    const parsed = parseCsv(csv);
    const { leads } = applyMapping(parsed, { email: "Email", firstName: "First" });
    // mapping drops the invalid email row → 4 candidates
    expect(leads).toHaveLength(4);

    const db = orgScoped(orgId);
    const emails = leads.map((l) => l.email);
    const [suppressed, existing] = await Promise.all([
      db.suppression.findMany({ where: { email: { in: emails } } }),
      db.lead.findMany({ where: { email: { in: emails } } }),
    ]);
    const block = new Set([...suppressed.map((s) => s.email), ...existing.map((e) => e.email)]);
    const toInsert = leads.filter((l) => !block.has(l.email));

    expect(toInsert.map((l) => l.email).sort()).toEqual([`fresh1@${tag}.com`, `fresh2@${tag}.com`]);

    for (const l of toInsert) await db.lead.create({ data: { email: l.email, firstName: l.firstName, status: "NEW" } });

    // Org now has: existing + fresh1 + fresh2 = 3
    expect(await db.lead.count()).toBe(3);
  });
});
