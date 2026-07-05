import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { computeStage, pickQuickWins, SLA, MIN_LIST } from "@/lib/onboarding";

const SUB = new Date("2026-06-01T00:00:00Z");

describe("onboarding stage (pure)", () => {
  it("walks through the stages from real signals", () => {
    expect(computeStage({ submittedAt: null, leadCount: 0, draftCount: 0, sentCount: 0, activityCount: 0 })).toBe("INTAKE");
    expect(computeStage({ submittedAt: SUB, leadCount: 80, draftCount: 0, sentCount: 0, activityCount: 0 })).toBe("BUILDING");
    expect(computeStage({ submittedAt: null, leadCount: 80, draftCount: 5, sentCount: 0, activityCount: 0 })).toBe("BUILDING");
    expect(computeStage({ submittedAt: SUB, leadCount: 80, draftCount: 5, sentCount: 3, activityCount: 0 })).toBe("OUTREACH");
    expect(computeStage({ submittedAt: SUB, leadCount: 80, draftCount: 5, sentCount: 3, activityCount: 1 })).toBe("LIVE");
  });

  it("keeps the promised SLA windows", () => {
    expect(SLA.buildHours).toBe(48);
    expect(SLA.outreachHours).toBe(72);
    expect(SLA.activeDays).toBe(7);
    expect(MIN_LIST).toBe(50);
  });
});

describe("quick wins", () => {
  const tag = `qw-${Math.random().toString(36).slice(2, 8)}`;
  let orgId: string;

  afterAll(async () => {
    await prisma.org.delete({ where: { id: orgId } }).catch(() => {});
  });

  it("ranks the lead with a real inquiry first, excludes invalid, and echoes their words", async () => {
    const org = await prisma.org.create({ data: { name: `Org ${tag}`, slug: `org-${tag}`, type: "CLIENT" } });
    orgId = org.id;
    await prisma.lead.create({
      data: { orgId, email: `warm-${tag}@x.com`, firstName: "Dana", status: "NEW", reachability: "REACHABLE", originalInquiry: "coaching for her Q4 launch", dealValueCents: 500000 },
    });
    await prisma.lead.create({
      data: { orgId, email: `cool-${tag}@x.com`, firstName: "Sam", status: "NEW", reachability: "RISKY", dealValueCents: 900000 },
    });
    await prisma.lead.create({
      data: { orgId, email: `bad-${tag}@x.com`, firstName: "Nope", status: "NEW", reachability: "INVALID", originalInquiry: "should be excluded", dealValueCents: 999999 },
    });

    const wins = await pickQuickWins(orgId);
    expect(wins.length).toBe(2); // invalid excluded
    // The lead with a real inquiry ranks first despite a lower deal value.
    expect(wins[0].name).toBe("Dana");
    expect(wins[0].opener).toContain("Q4 launch");
    expect(wins.some((w) => w.name === "Nope")).toBe(false);
  });
});
