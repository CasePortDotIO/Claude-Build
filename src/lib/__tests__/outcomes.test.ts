import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { recordOutcome, outcomeAggregates } from "@/lib/outcomes";
import { experimentArm } from "@/lib/agent/experiments";

describe("§10 outcome-data capture", () => {
  const tag = `oc-${Math.random().toString(36).slice(2, 8)}`;
  let orgId: string;

  beforeAll(async () => {
    const org = await prisma.org.create({ data: { name: `Org ${tag}`, slug: `org-${tag}`, type: "CLIENT", vertical: "coaching" } });
    orgId = org.id;
  });

  afterAll(async () => {
    await prisma.org.delete({ where: { id: orgId } }).catch(() => {});
  });

  it("logs events and snapshots the org vertical", async () => {
    await recordOutcome({ orgId, kind: "SENT", subject: "still thinking?", variantAngle: "goal-led", sendHour: 9 });
    await recordOutcome({ orgId, kind: "SENT", subject: "quick thought", variantAngle: "curiosity", sendHour: 9 });
    await recordOutcome({ orgId, kind: "REPLIED" });
    await recordOutcome({ orgId, kind: "BOOKED", valueCents: 250000 });

    const events = await prisma.outcomeEvent.findMany({ where: { orgId } });
    expect(events).toHaveLength(4);
    expect(events.every((e) => e.vertical === "coaching")).toBe(true);
  });

  it("completes the corpus vector (touch · source · arm) from the lead", async () => {
    // Own org so this event doesn't pollute the shared-org aggregates above.
    const o = await prisma.org.create({ data: { name: `Org ${tag}-cv`, slug: `org-${tag}-cv`, type: "CLIENT" } });
    try {
      const lead = await prisma.lead.create({ data: { orgId: o.id, email: `l-${tag}@x.com`, source: "hubspot" } });
      const mb = await prisma.mailbox.create({ data: { orgId: o.id, email: `m-${tag}@x.sim`, provider: "SIMULATION", status: "CONNECTED" } });
      // Two prior outbound touches → this event is on cadence step 2.
      for (let i = 0; i < 2; i++) {
        await prisma.message.create({
          data: { orgId: o.id, leadId: lead.id, mailboxId: mb.id, direction: "OUTBOUND", status: "SENT", fromEmail: "op@x.sim", toEmail: lead.email, subject: `t${i}`, body: "…" },
        });
      }

      await recordOutcome({ orgId: o.id, leadId: lead.id, kind: "REPLIED" });

      const row = await prisma.outcomeEvent.findFirst({ where: { orgId: o.id, leadId: lead.id }, orderBy: { createdAt: "desc" } });
      expect(row?.source).toBe("hubspot"); // list-source snapshotted
      expect(row?.touch).toBe(2); // cadence step derived from outbound history
      expect(row?.arm).toBe(experimentArm(lead.id)); // the system-assigned randomized arm, logged
      expect(row?.arm).toMatch(/^gap:[AB]\|angle:/);
    } finally {
      await prisma.org.delete({ where: { id: o.id } }).catch(() => {});
    }
  });

  it("aggregates conversion rates by a chosen dimension", async () => {
    const byAngle = await outcomeAggregates("variantAngle", orgId);
    const goalLed = byAngle.find((a) => a.dimension === "goal-led");
    expect(goalLed?.sent).toBe(1);

    const byHour = await outcomeAggregates("sendHour", orgId);
    const nine = byHour.find((a) => a.dimension === "9");
    expect(nine?.sent).toBe(2); // both sends fired at 9am

    // Reply/book rates are meaningful at the shared-dimension (vertical) level,
    // where every event carries the same tag: 2 sent, 1 replied, 1 booked.
    const byVertical = await outcomeAggregates("vertical", orgId);
    const coaching = byVertical.find((a) => a.dimension === "coaching");
    expect(coaching?.sent).toBe(2);
    expect(coaching?.replyRate).toBeCloseTo(0.5);
    expect(coaching?.bookRate).toBeCloseTo(0.5);
  });

  it("scopes aggregates to one org (no cross-customer leakage)", async () => {
    const other = await prisma.org.create({ data: { name: `Other ${tag}`, slug: `other-${tag}`, type: "CLIENT" } });
    await recordOutcome({ orgId: other.id, kind: "SENT", variantAngle: "goal-led" });
    const mineOnly = await outcomeAggregates("variantAngle", orgId);
    const goalLed = mineOnly.find((a) => a.dimension === "goal-led");
    expect(goalLed?.sent).toBe(1); // still 1 — the other org's send is not counted
    await prisma.org.delete({ where: { id: other.id } }).catch(() => {});
  });
});
