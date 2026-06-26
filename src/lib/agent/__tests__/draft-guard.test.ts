import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { generateDraftsForLead, DraftGuardError } from "@/lib/agent/draft";

/**
 * End-to-end (DB-backed) test of the draft orchestrator, including the hard
 * compliance rails: opted-out / suppressed leads must never get a draft, and a
 * successful draft must persist variants + an audit run and advance the lead.
 */
describe("generateDraftsForLead", () => {
  const tag = `draft-${Math.random().toString(36).slice(2, 8)}`;
  let orgId: string;
  let eligibleId: string;
  let optedOutId: string;
  let suppressedId: string;

  beforeAll(async () => {
    const org = await prisma.org.create({ data: { name: `Org ${tag}`, slug: `org-${tag}`, type: "CLIENT" } });
    orgId = org.id;

    const eligible = await prisma.lead.create({
      data: { orgId, email: `eligible@${tag}.com`, firstName: "Ada", status: "NEW", statedGoal: "shipping your first course", originalInquiry: "the course bundle" },
    });
    eligibleId = eligible.id;

    const opted = await prisma.lead.create({
      data: { orgId, email: `opted@${tag}.com`, firstName: "Opt", status: "OPTED_OUT" },
    });
    optedOutId = opted.id;

    const suppressed = await prisma.lead.create({
      data: { orgId, email: `suppressed@${tag}.com`, firstName: "Sup", status: "NEW" },
    });
    suppressedId = suppressed.id;
    await prisma.suppressionEntry.create({ data: { orgId, email: `suppressed@${tag}.com`, reason: "OPTED_OUT" } });
  });

  afterAll(async () => {
    await prisma.draft.deleteMany({ where: { orgId } });
    await prisma.agentRun.deleteMany({ where: { orgId } });
    await prisma.suppressionEntry.deleteMany({ where: { orgId } });
    await prisma.lead.deleteMany({ where: { orgId } });
    await prisma.org.deleteMany({ where: { id: orgId } });
    await prisma.$disconnect();
  });

  it("drafts for an eligible lead, persisting variants + audit + state change", async () => {
    const draft = await generateDraftsForLead({ orgId, leadId: eligibleId, operatorName: "Test Co" });
    expect(draft.variants.length).toBeGreaterThanOrEqual(2);
    expect(draft.selectedVariantId).toBeTruthy();

    const lead = await prisma.lead.findUnique({ where: { id: eligibleId } });
    expect(lead?.status).toBe("AWAITING_APPROVAL");

    const runs = await prisma.agentRun.count({ where: { orgId, leadId: eligibleId, step: "DRAFT" } });
    expect(runs).toBe(1);
  });

  it("supersedes the prior pending draft when re-run", async () => {
    await generateDraftsForLead({ orgId, leadId: eligibleId, operatorName: "Test Co" });
    const pending = await prisma.draft.count({ where: { orgId, leadId: eligibleId, status: "PENDING_APPROVAL" } });
    const superseded = await prisma.draft.count({ where: { orgId, leadId: eligibleId, status: "SUPERSEDED" } });
    expect(pending).toBe(1); // only ever one live draft
    expect(superseded).toBeGreaterThanOrEqual(1);
  });

  it("refuses to draft for an opted-out lead", async () => {
    await expect(generateDraftsForLead({ orgId, leadId: optedOutId, operatorName: "Test Co" })).rejects.toBeInstanceOf(
      DraftGuardError,
    );
    expect(await prisma.draft.count({ where: { orgId, leadId: optedOutId } })).toBe(0);
  });

  it("refuses to draft for a suppressed email", async () => {
    await expect(generateDraftsForLead({ orgId, leadId: suppressedId, operatorName: "Test Co" })).rejects.toBeInstanceOf(
      DraftGuardError,
    );
    expect(await prisma.draft.count({ where: { orgId, leadId: suppressedId } })).toBe(0);
  });
});
