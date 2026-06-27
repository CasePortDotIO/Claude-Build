import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { ingestLeads } from "@/lib/import/ingest";
import { generateDraftsForLead } from "@/lib/agent/draft";
import { firstRunState } from "@/lib/metrics";

describe("M9 magic — dormant value + voice fidelity", () => {
  const tag = `m9-${Math.random().toString(36).slice(2, 8)}`;
  let orgId: string;

  beforeAll(async () => {
    const org = await prisma.org.create({
      data: { name: `Org ${tag}`, slug: `org-${tag}`, type: "CLIENT", avgClientValueCents: 250000 },
    });
    orgId = org.id;
  });

  afterAll(async () => {
    await prisma.org.delete({ where: { id: orgId } }).catch(() => {});
  });

  it("stamps each imported lead with the org's average client value", async () => {
    const res = await ingestLeads(
      [
        { email: `a-${tag}@x.com`, firstName: "Ada", statedGoal: "scaling your practice" },
        { email: `b-${tag}@x.com`, firstName: "Ben", statedGoal: "booking more calls" },
      ],
      {
        orgId,
        name: "test sweep",
        source: "csv",
        consentBasis: "PRIOR_INQUIRY",
        priorContactAttested: true,
        totalRows: 2,
      },
    );
    expect(res.ok).toBe(true);
    expect(res.imported).toBe(2);

    const leads = await prisma.lead.findMany({ where: { orgId } });
    expect(leads).toHaveLength(2);
    for (const l of leads) expect(l.dealValueCents).toBe(250000);

    // The dormant pipeline the reveal would show: imported × avg value.
    const dormant = leads.reduce((n, l) => n + l.dealValueCents, 0);
    expect(dormant).toBe(500000);
  });

  it("persists a bounded voice-match score on each generated variant", async () => {
    const lead = await prisma.lead.findFirstOrThrow({ where: { orgId } });
    const draft = await generateDraftsForLead({ orgId, leadId: lead.id, operatorName: "Jess" });
    expect(draft.variants.length).toBeGreaterThan(0);

    const variants = await prisma.draftVariant.findMany({ where: { draftId: draft.id } });
    for (const v of variants) {
      expect(v.voiceMatch).not.toBeNull();
      expect(v.voiceMatch!).toBeGreaterThanOrEqual(0.62);
      expect(v.voiceMatch!).toBeLessThanOrEqual(0.98);
    }
  });

  it("reports first-run progress from real data", async () => {
    const state = await firstRunState(orgId);
    expect(state.leadsImported).toBe(true); // leads exist
    expect(state.draftsGenerated).toBe(true); // we drafted above
    expect(state.mailboxConnected).toBe(false); // never connected one
    expect(state.complete).toBe(false);
  });
});
