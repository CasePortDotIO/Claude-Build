import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { bookCall, BookingError, availabilityLabels } from "@/lib/agent/booking";
import { commandCenterKpis } from "@/lib/metrics";

/**
 * DB-backed test of the booking pipeline + KPI aggregation. Uses the SIMULATION
 * calendar so no Cal.com account is needed.
 */
describe("booking pipeline", () => {
  const tag = `book-${Math.random().toString(36).slice(2, 8)}`;
  let orgId: string;
  let otherOrgId: string;
  let mailboxId: string;

  beforeAll(async () => {
    const org = await prisma.org.create({ data: { name: `Org ${tag}`, slug: `org-${tag}`, type: "CLIENT" } });
    orgId = org.id;
    const other = await prisma.org.create({ data: { name: `Other ${tag}`, slug: `other-${tag}`, type: "CLIENT" } });
    otherOrgId = other.id;
    // allowOutOfHours so the pipeline/KPI assertions don't depend on which day
    // the test happens to run; §6 hours enforcement is covered in validate.test.ts.
    await prisma.calendarConnection.create({ data: { orgId, provider: "SIMULATION", status: "CONNECTED", timezone: "UTC", allowOutOfHours: true } });
    const mb = await prisma.mailbox.create({ data: { orgId, email: `m@${tag}.sim`, provider: "SIMULATION", status: "CONNECTED" } });
    mailboxId = mb.id;
  });

  afterAll(async () => {
    for (const id of [orgId, otherOrgId]) {
      await prisma.booking.deleteMany({ where: { orgId: id } });
      await prisma.draft.deleteMany({ where: { orgId: id } });
      await prisma.conversation.deleteMany({ where: { orgId: id } });
      await prisma.message.deleteMany({ where: { orgId: id } });
      await prisma.mailbox.deleteMany({ where: { orgId: id } });
      await prisma.calendarConnection.deleteMany({ where: { orgId: id } });
      await prisma.auditLog.deleteMany({ where: { orgId: id } });
      await prisma.lead.deleteMany({ where: { orgId: id } });
      await prisma.org.deleteMany({ where: { id } });
    }
    await prisma.$disconnect();
  });

  it("offers real availability from the connected calendar", async () => {
    const labels = await availabilityLabels(orgId);
    expect(labels.length).toBeGreaterThan(0);
  });

  it("books a call → lead BOOKED, Booking + value recorded", async () => {
    const lead = await prisma.lead.create({
      data: { orgId, email: `win@${tag}.com`, firstName: "Win", status: "NEGOTIATING", dealValueCents: 250000 },
    });
    const convo = await prisma.conversation.create({
      data: { orgId, leadId: lead.id, mailboxId, subject: "Re", status: "NEEDS_REVIEW", threadId: "t" },
    });
    // Pending reply draft should be superseded on booking.
    await prisma.draft.create({ data: { orgId, leadId: lead.id, status: "PENDING_APPROVAL" } });

    const start = new Date(Date.now() + 86_400_000);
    const booking = await bookCall({ orgId, leadId: lead.id, startsAt: start });
    expect(booking.valueCents).toBe(250000);
    expect(booking.providerEventId).toMatch(/^simcal-/);

    const after = await prisma.lead.findUnique({ where: { id: lead.id } });
    expect(after?.status).toBe("BOOKED");
    expect((await prisma.conversation.findUnique({ where: { id: convo.id } }))?.status).toBe("BOOKED");
    expect(await prisma.draft.count({ where: { leadId: lead.id, status: "PENDING_APPROVAL" } })).toBe(0);
  });

  it("refuses to book an opted-out lead", async () => {
    const lead = await prisma.lead.create({ data: { orgId, email: `no@${tag}.com`, status: "OPTED_OUT" } });
    await expect(bookCall({ orgId, leadId: lead.id, startsAt: new Date(Date.now() + 86_400_000) })).rejects.toBeInstanceOf(BookingError);
  });

  it("refuses to double-book a slot already taken by another lead (§6)", async () => {
    // win@ already has a booking; a DIFFERENT lead at that exact slot must be refused.
    const taken = await prisma.booking.findFirstOrThrow({ where: { orgId }, orderBy: { createdAt: "desc" } });
    const other = await prisma.lead.create({ data: { orgId, email: `clash@${tag}.com`, firstName: "Clash", status: "NEGOTIATING" } });
    await expect(bookCall({ orgId, leadId: other.id, startsAt: taken.startsAt })).rejects.toBeInstanceOf(BookingError);
  });

  it("KPIs aggregate recovered revenue + calls, isolated per org", async () => {
    const kpis = await commandCenterKpis(orgId);
    expect(kpis.callsBooked).toBe(1);
    expect(kpis.recoveredRevenueCents).toBe(250000);

    // The other org sees nothing.
    const otherKpis = await commandCenterKpis(otherOrgId);
    expect(otherKpis.callsBooked).toBe(0);
    expect(otherKpis.recoveredRevenueCents).toBe(0);
  });
});
