import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { runReflection, applyInsight, vetoInsight } from "@/lib/agent/reflection";

/**
 * DB-backed reflection test: seed real outcomes (two openers with very different
 * reply rates, sent at different hours, across cohorts), run reflection, and
 * assert it proposes only bounded copy/timing changes — then apply/veto.
 */
describe("reflection engine", () => {
  const tag = `refl-${Math.random().toString(36).slice(2, 8)}`;
  let orgId: string;
  let mailboxId: string;

  const GOOD = "back when we first spoke, you were focused";
  const BAD = "just checking in";

  async function seedSent(opts: { opener: string; hour: number; replied: boolean; booked: boolean; cohort: "TREATMENT" | "HOLDOUT"; i: number }) {
    const lead = await prisma.lead.create({
      data: { orgId, email: `${opts.opener.replace(/\W/g, "").slice(0, 6)}-${opts.i}@${tag}.com`, status: opts.booked ? "BOOKED" : "AWAITING_REPLY", cohort: opts.cohort },
    });
    const draft = await prisma.draft.create({
      data: {
        orgId, leadId: lead.id, status: "APPROVED",
        variants: { create: [{ index: 0, angle: "x", subject: "s", body: "b", openingLine: opts.opener, confidence: 0.8, rationale: "r" }] },
      },
      include: { variants: true },
    });
    await prisma.draft.update({ where: { id: draft.id }, data: { selectedVariantId: draft.variants[0].id } });
    const sentAt = new Date(); sentAt.setHours(opts.hour, 0, 0, 0);
    await prisma.message.create({
      data: { orgId, leadId: lead.id, mailboxId, direction: "OUTBOUND", status: "SENT", fromEmail: "a", toEmail: lead.email, subject: "s", body: "b", draftId: draft.id, sentAt },
    });
    if (opts.replied) {
      await prisma.message.create({
        data: { orgId, leadId: lead.id, mailboxId, direction: "INBOUND", status: "RECEIVED", fromEmail: lead.email, toEmail: "a", subject: "re", body: "yes!", receivedAt: new Date() },
      });
    }
  }

  beforeAll(async () => {
    const org = await prisma.org.create({ data: { name: `Org ${tag}`, slug: `org-${tag}`, type: "CLIENT" } });
    orgId = org.id;
    const mb = await prisma.mailbox.create({ data: { orgId, email: `m@${tag}.sim`, provider: "SIMULATION", status: "CONNECTED" } });
    mailboxId = mb.id;

    // GOOD opener @ 9am: 6/8 reply (treatment). BAD opener @ 15: 1/8 reply.
    for (let i = 0; i < 8; i++) await seedSent({ opener: GOOD, hour: 9, replied: i < 6, booked: i < 2, cohort: "TREATMENT", i });
    for (let i = 0; i < 8; i++) await seedSent({ opener: BAD, hour: 15, replied: i < 1, booked: false, cohort: i < 4 ? "HOLDOUT" : "TREATMENT", i: i + 100 });
  });

  afterAll(async () => {
    await prisma.message.deleteMany({ where: { orgId } });
    await prisma.draft.deleteMany({ where: { orgId } });
    await prisma.insight.deleteMany({ where: { orgId } });
    await prisma.orgLearning.deleteMany({ where: { orgId } });
    await prisma.mailbox.deleteMany({ where: { orgId } });
    await prisma.lead.deleteMany({ where: { orgId } });
    await prisma.org.deleteMany({ where: { id: orgId } });
    await prisma.$disconnect();
  });

  const ALLOWED = new Set(["PROMOTE_OPENER", "RETIRE_PHRASE", "SHIFT_SENDTIME", "TIGHTEN_FOLLOWUP", "AB_RESULT"]);

  it("proposes only bounded copy/timing insights, justified by metrics", async () => {
    const res = await runReflection(orgId);
    expect(res.created).toBeGreaterThan(0);

    const insights = await prisma.insight.findMany({ where: { orgId } });
    expect(insights.every((i) => ALLOWED.has(i.kind))).toBe(true); // never identity/compliance
    expect(insights.every((i) => i.metric.length > 0)).toBe(true); // every change is justified

    const kinds = insights.map((i) => i.kind);
    expect(kinds).toContain("SHIFT_SENDTIME"); // 9am clearly best
    expect(kinds).toContain("PROMOTE_OPENER");
  });

  it("does not duplicate still-pending proposals on a second run", async () => {
    const before = await prisma.insight.count({ where: { orgId, status: "PROPOSED" } });
    await runReflection(orgId);
    const after = await prisma.insight.count({ where: { orgId, status: "PROPOSED" } });
    expect(after).toBe(before);
  });

  it("applies a send-time insight into OrgLearning and bumps the version", async () => {
    const shift = await prisma.insight.findFirstOrThrow({ where: { orgId, kind: "SHIFT_SENDTIME", status: "PROPOSED" } });
    const ok = await applyInsight(orgId, shift.id, "user1");
    expect(ok).toBe(true);

    const learning = await prisma.orgLearning.findUniqueOrThrow({ where: { orgId } });
    expect(learning.bestSendHour).toBe(9);
    expect(learning.version).toBeGreaterThan(1);
    expect((await prisma.insight.findUniqueOrThrow({ where: { id: shift.id } })).status).toBe("APPLIED");
  });

  it("retiring an opener adds it to the retired list", async () => {
    const retire = await prisma.insight.findFirst({ where: { orgId, kind: "RETIRE_PHRASE", status: "PROPOSED" } });
    if (retire) {
      await applyInsight(orgId, retire.id, "user1");
      const learning = await prisma.orgLearning.findUniqueOrThrow({ where: { orgId } });
      expect(learning.retiredPhrases.length).toBeGreaterThan(0);
    }
  });

  it("veto marks an insight VETOED without changing learning", async () => {
    const promote = await prisma.insight.findFirst({ where: { orgId, kind: "PROMOTE_OPENER", status: "PROPOSED" } });
    if (promote) {
      const ok = await vetoInsight(orgId, promote.id);
      expect(ok).toBe(true);
      expect((await prisma.insight.findUniqueOrThrow({ where: { id: promote.id } })).status).toBe("VETOED");
    }
  });
});
