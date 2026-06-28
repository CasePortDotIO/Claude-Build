import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { runAutopilotForOrg } from "@/lib/agent/autopilot";

/**
 * The always-on engine (M17). Verifies the two load-bearing guarantees:
 *  - default-off means default no-op (existing behavior unchanged),
 *  - autopilotDraft auto-drafts fresh leads but still runs the contactability
 *    gate, so suppressed/opted-out leads are skipped, never sent.
 * Uses the deterministic stub provider (no API key needed).
 */
describe("autopilot engine", () => {
  const tag = `auto-${Math.random().toString(36).slice(2, 8)}`;
  let orgId: string;

  beforeAll(async () => {
    const org = await prisma.org.create({ data: { name: `Org ${tag}`, slug: `org-${tag}`, type: "CLIENT" } });
    orgId = org.id;
  });

  afterAll(async () => {
    await prisma.draft.deleteMany({ where: { orgId } });
    await prisma.agentRun.deleteMany({ where: { orgId } });
    await prisma.suppressionEntry.deleteMany({ where: { orgId } });
    await prisma.lead.deleteMany({ where: { orgId } });
    await prisma.auditLog.deleteMany({ where: { orgId } });
    await prisma.org.deleteMany({ where: { id: orgId } });
    await prisma.$disconnect();
  });

  it("is a no-op when every capability is off (default)", async () => {
    const lead = await prisma.lead.create({
      data: { orgId, email: `off@${tag}.com`, firstName: "Off", status: "NEW", reachability: "REACHABLE" },
    });
    const res = await runAutopilotForOrg(orgId);
    expect(res).toMatchObject({ synced: 0, drafted: 0, sent: 0 });
    expect((await prisma.lead.findUnique({ where: { id: lead.id } }))?.status).toBe("NEW");
    await prisma.lead.delete({ where: { id: lead.id } });
  });

  it("auto-drafts fresh NEW leads (queued for approval) when autopilotDraft is on", async () => {
    await prisma.org.update({ where: { id: orgId }, data: { autopilotDraft: true } });
    const lead = await prisma.lead.create({
      data: { orgId, email: `fresh@${tag}.com`, firstName: "Fresh", status: "NEW", reachability: "REACHABLE", statedGoal: "getting back on track" },
    });

    const res = await runAutopilotForOrg(orgId);
    expect(res.drafted).toBeGreaterThanOrEqual(1);

    expect((await prisma.lead.findUnique({ where: { id: lead.id } }))?.status).toBe("AWAITING_APPROVAL");
    const draft = await prisma.draft.findFirst({ where: { orgId, leadId: lead.id } });
    expect(draft?.status).toBe("PENDING_APPROVAL");
  });

  it("skips leads the contactability gate refuses (suppressed) without throwing", async () => {
    const email = `stop@${tag}.com`;
    await prisma.lead.create({ data: { orgId, email, status: "NEW", reachability: "REACHABLE" } });
    await prisma.suppressionEntry.create({ data: { orgId, email, reason: "OPTED_OUT" } });

    const res = await runAutopilotForOrg(orgId);
    expect(res.skippedDrafts).toBeGreaterThanOrEqual(1);
    expect(res.drafted).toBe(0);
  });
});
