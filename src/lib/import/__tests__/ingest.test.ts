import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { ingestLeads, parseImportDate } from "@/lib/import/ingest";
import { sampleLeadsFor } from "@/lib/leadsource/sample";

describe("parseImportDate — coldness anchor guardrails", () => {
  it("parses an ordinary past date", () => {
    expect(parseImportDate("2025-06-01")?.toISOString().slice(0, 10)).toBe("2025-06-01");
  });
  it("returns null for blank / unparseable input", () => {
    expect(parseImportDate(undefined)).toBeNull();
    expect(parseImportDate("")).toBeNull();
    expect(parseImportDate("   ")).toBeNull();
    expect(parseImportDate("not a date")).toBeNull();
  });
  it("rejects future dates (a mis-mapped column) rather than poisoning coldness", () => {
    expect(parseImportDate("2999-01-01")).toBeNull();
  });
  it("rejects implausible pre-2000 dates (epoch/0000 junk)", () => {
    expect(parseImportDate("1970-01-01")).toBeNull();
    expect(parseImportDate("1899-12-31")).toBeNull();
  });
});

/**
 * DB-backed test of the shared ingest pipeline that EVERY importer uses (CSV +
 * all M7 lead sources): prior-contact gate, suppression + dup filtering, audit.
 */
describe("shared lead ingest", () => {
  const tag = `ingest-${Math.random().toString(36).slice(2, 8)}`;
  let orgId: string;

  beforeAll(async () => {
    const org = await prisma.org.create({ data: { name: `Org ${tag}`, slug: `org-${tag}`, type: "CLIENT" } });
    orgId = org.id;
  });

  afterAll(async () => {
    await prisma.lead.deleteMany({ where: { orgId } });
    await prisma.leadImport.deleteMany({ where: { orgId } });
    await prisma.suppressionEntry.deleteMany({ where: { orgId } });
    await prisma.auditLog.deleteMany({ where: { orgId } });
    await prisma.org.deleteMany({ where: { id: orgId } });
    await prisma.$disconnect();
  });

  it("refuses to import without a prior-contact attestation (§9)", async () => {
    const res = await ingestLeads(sampleLeadsFor("HUBSPOT"), {
      orgId, name: "x", source: "hubspot", consentBasis: "PRIOR_INQUIRY", priorContactAttested: false,
    });
    expect(res.ok).toBe(false);
    expect(await prisma.lead.count({ where: { orgId } })).toBe(0);
  });

  it("imports sample source leads through the gate", async () => {
    const res = await ingestLeads(sampleLeadsFor("HUBSPOT"), {
      orgId, name: "HubSpot import (sample)", source: "hubspot", consentBasis: "PRIOR_INQUIRY", priorContactAttested: true,
    });
    expect(res.ok).toBe(true);
    expect(res.imported).toBe(3);
    const leads = await prisma.lead.findMany({ where: { orgId } });
    expect(leads.every((l) => l.source === "hubspot" && l.priorContact)).toBe(true);
    expect(await prisma.leadImport.count({ where: { orgId, source: "hubspot" } })).toBe(1);
  });

  it("filters suppressed + duplicate emails on a second import", async () => {
    // Suppress one of the Mailchimp samples; one HubSpot email already exists.
    const mc = sampleLeadsFor("MAILCHIMP");
    await prisma.suppressionEntry.create({ data: { orgId, email: mc[0].email, reason: "OPTED_OUT" } });

    const res = await ingestLeads([...mc, ...sampleLeadsFor("HUBSPOT")], {
      orgId, name: "mix", source: "mailchimp", consentBasis: "PRIOR_INQUIRY", priorContactAttested: true,
    });
    expect(res.ok).toBe(true);
    expect(res.suppressed).toBe(1); // the opted-out mailchimp lead
    expect(res.duplicatesInDb).toBe(3); // the 3 hubspot leads already imported
    expect(res.imported).toBe(mc.length - 1);
  });
});
