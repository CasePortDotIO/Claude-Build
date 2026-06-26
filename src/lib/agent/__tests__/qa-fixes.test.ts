import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { bookCall, BookingError } from "@/lib/agent/booking";
import { reengagementSweep } from "@/lib/agent/maintenance";
import { StubProvider } from "@/lib/ai/provider";
import { defaultVoiceProfile } from "@/lib/agent/voice";
import { buildOptOutLine } from "@/lib/agent/draft";
import type { DraftInput } from "@/lib/ai/types";

describe("QA fixes", () => {
  const tag = `qa-${Math.random().toString(36).slice(2, 8)}`;
  let orgId: string;
  let mailboxId: string;

  beforeAll(async () => {
    const org = await prisma.org.create({ data: { name: `Org ${tag}`, slug: `org-${tag}`, type: "CLIENT" } });
    orgId = org.id;
    const mb = await prisma.mailbox.create({ data: { orgId, email: `m@${tag}.sim`, provider: "SIMULATION", status: "CONNECTED" } });
    mailboxId = mb.id;
    await prisma.calendarConnection.create({ data: { orgId, provider: "SIMULATION", status: "CONNECTED" } });
  });

  afterAll(async () => {
    await prisma.booking.deleteMany({ where: { orgId } });
    await prisma.message.deleteMany({ where: { orgId } });
    await prisma.auditLog.deleteMany({ where: { orgId } });
    await prisma.suppressionEntry.deleteMany({ where: { orgId } });
    await prisma.orgLearning.deleteMany({ where: { orgId } });
    await prisma.mailbox.deleteMany({ where: { orgId } });
    await prisma.calendarConnection.deleteMany({ where: { orgId } });
    await prisma.lead.deleteMany({ where: { orgId } });
    await prisma.org.deleteMany({ where: { id: orgId } });
    await prisma.$disconnect();
  });

  it("bookCall refuses a SUPPRESSED lead even if status isn't blocked", async () => {
    const lead = await prisma.lead.create({ data: { orgId, email: `sup@${tag}.com`, status: "NEGOTIATING" } });
    await prisma.suppressionEntry.create({ data: { orgId, email: `sup@${tag}.com`, reason: "OPTED_OUT" } });
    await expect(bookCall({ orgId, leadId: lead.id, startsAt: new Date(Date.now() + 86_400_000) })).rejects.toBeInstanceOf(BookingError);
    expect(await prisma.booking.count({ where: { leadId: lead.id } })).toBe(0);
  });

  it("reengagementSweep cools silent leads past the gap, but not replied/recent ones", async () => {
    const old = new Date(Date.now() - 10 * 86_400_000);
    const recent = new Date();

    const silent = await prisma.lead.create({ data: { orgId, email: `silent@${tag}.com`, status: "AWAITING_REPLY", lastTouchAt: old } });
    const replied = await prisma.lead.create({ data: { orgId, email: `replied@${tag}.com`, status: "AWAITING_REPLY", lastTouchAt: old } });
    const fresh = await prisma.lead.create({ data: { orgId, email: `fresh@${tag}.com`, status: "AWAITING_REPLY", lastTouchAt: recent } });

    // The replied lead has a genuine inbound message → must NOT be cooled.
    await prisma.message.create({ data: { orgId, leadId: replied.id, mailboxId, direction: "INBOUND", status: "RECEIVED", fromEmail: replied.email, toEmail: "op", subject: "re", body: "yes" } });

    const res = await reengagementSweep(orgId);
    expect(res.cooled).toBe(1);
    expect((await prisma.lead.findUnique({ where: { id: silent.id } }))?.status).toBe("COOLED");
    expect((await prisma.lead.findUnique({ where: { id: replied.id } }))?.status).toBe("AWAITING_REPLY");
    expect((await prisma.lead.findUnique({ where: { id: fresh.id } }))?.status).toBe("AWAITING_REPLY");
    // Re-engagement time was scheduled.
    expect((await prisma.lead.findUnique({ where: { id: silent.id } }))?.coolDownUntil).toBeTruthy();
  });

  it("uses the learned bestSendHour to time re-engagement", async () => {
    await prisma.orgLearning.create({ data: { orgId, followUpGapDays: 2, bestSendHour: 9 } });
    const lead = await prisma.lead.create({ data: { orgId, email: `timed@${tag}.com`, status: "AWAITING_REPLY", lastTouchAt: new Date(Date.now() - 5 * 86_400_000) } });
    await reengagementSweep(orgId);
    const after = await prisma.lead.findUnique({ where: { id: lead.id } });
    expect(after?.status).toBe("COOLED");
    expect(after?.coolDownUntil?.getHours()).toBe(9); // timed to the learned window
  });
});

describe("promoted openers bias the stub", () => {
  function input(promoted: string[]): DraftInput {
    return {
      lead: { firstName: "Dana", company: null, originalInquiry: "the cohort", statedGoal: "replacing your salary with coaching income", toneRead: "warm", objections: [] },
      voice: defaultVoiceProfile(),
      operatorName: "Jess",
      optOutLine: buildOptOutLine(),
      voiceSamples: [],
      similarObjections: [],
      variantCount: 3,
      promotedOpeners: promoted,
    };
  }

  it("boosts confidence for a promoted opener so it leads", async () => {
    const base = await new StubProvider().draftReengagement(input([]));
    const promoted = await new StubProvider().draftReengagement(input(["back when we first spoke"]));
    const goalLedBase = base.variants.find((v) => v.angle === "goal-led")!;
    const goalLedPromoted = promoted.variants.find((v) => v.angle === "goal-led")!;
    expect(goalLedPromoted.confidence).toBeGreaterThan(goalLedBase.confidence);
    expect(goalLedPromoted.rationale).toMatch(/out-performs/);
  });
});
