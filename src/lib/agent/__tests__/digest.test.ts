import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { emailMorningBrief, renderBrief } from "@/lib/agent/digest";
import type { DailyBrief } from "@/lib/retention";

const activeBrief: DailyBrief = {
  drafted: 4,
  replied: 2,
  booked: 1,
  recoveredCents: 300000,
  pendingApprovals: 3,
  latestInsight: { title: "t", body: "Sends around 9am reply best." },
  cumulativeRecoveredCents: 900000,
  hasActivity: true,
  windowHours: 24,
};

describe("Morning Brief email digest (M10)", () => {
  const tag = `dig-${Math.random().toString(36).slice(2, 8)}`;
  let orgId: string;

  beforeAll(async () => {
    const org = await prisma.org.create({ data: { name: `Org ${tag}`, slug: `org-${tag}`, type: "CLIENT" } });
    orgId = org.id;
    const user = await prisma.user.create({ data: { email: `op-${tag}@x.com`, name: "Op", passwordHash: "x" } });
    await prisma.membership.create({ data: { orgId, userId: user.id, role: "CLIENT_ADMIN" } });
  });

  afterAll(async () => {
    await prisma.org.delete({ where: { id: orgId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { email: `op-${tag}@x.com` } }).catch(() => {});
  });

  it("renders a headline subject + actionable body", () => {
    const { subject, body } = renderBrief(activeBrief, "Monroe Coaching");
    expect(subject).toContain("Monroe Coaching");
    expect(subject.toLowerCase()).toContain("booked");
    expect(body).toContain("4 emails drafted");
    expect(body).toContain("3 drafts need your approval");
    expect(body).toContain("Sends around 9am reply best.");
  });

  it("skips on a quiet night", async () => {
    const res = await emailMorningBrief(orgId, { ...activeBrief, hasActivity: false });
    expect(res.emailed).toBe(0);
    expect(res.skipped).toBe("quiet night");
  });

  it("skips when no mailbox is connected", async () => {
    const res = await emailMorningBrief(orgId, activeBrief);
    expect(res.emailed).toBe(0);
    expect(res.skipped).toBe("no connected mailbox");
  });

  it("emails each operator once a mailbox is connected, and is idempotent per day", async () => {
    await prisma.mailbox.create({ data: { orgId, email: `mb-${tag}@x.sim`, provider: "SIMULATION", status: "CONNECTED" } });
    const first = await emailMorningBrief(orgId, activeBrief);
    expect(first.emailed).toBe(1);
    // Second run the same day must not double-send.
    const second = await emailMorningBrief(orgId, activeBrief);
    expect(second.emailed).toBe(0);
    expect(second.skipped).toBe("already sent today");
  });
});
