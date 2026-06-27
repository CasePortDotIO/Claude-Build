import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { sendDueReminders, sweepNoShows } from "@/lib/agent/reminders";

const HOUR = 3_600_000;
const NOW = new Date("2026-06-15T12:00:00Z");

describe("§6 reminders + no-show sweep", () => {
  const tag = `rem-${Math.random().toString(36).slice(2, 8)}`;
  let orgId: string;
  let leadId: string;

  async function mkBooking(startsInHours: number, over: Record<string, unknown> = {}) {
    const startsAt = new Date(NOW.getTime() + startsInHours * HOUR);
    return prisma.booking.create({
      data: {
        orgId,
        leadId,
        status: "CONFIRMED",
        startsAt,
        endsAt: new Date(startsAt.getTime() + 30 * 60_000),
        attendeeEmail: `att-${tag}@x.com`,
        timezone: "UTC",
        ...over,
      },
    });
  }

  beforeAll(async () => {
    const org = await prisma.org.create({ data: { name: `Org ${tag}`, slug: `org-${tag}`, type: "CLIENT" } });
    orgId = org.id;
    // A connected simulation mailbox so the transactional send "succeeds".
    await prisma.mailbox.create({ data: { orgId, email: `mb-${tag}@x.sim`, provider: "SIMULATION", status: "CONNECTED" } });
    const lead = await prisma.lead.create({ data: { orgId, email: `att-${tag}@x.com`, firstName: "Pat" } });
    leadId = lead.id;
  });

  afterAll(async () => {
    await prisma.org.delete({ where: { id: orgId } }).catch(() => {});
  });

  it("sends the 24h reminder once inside the day-before window", async () => {
    const b = await mkBooking(20); // 20h out → inside 24h, outside 1h
    const res = await sendDueReminders(orgId, NOW);
    expect(res.sent).toBeGreaterThanOrEqual(1);
    const after = await prisma.booking.findUniqueOrThrow({ where: { id: b.id } });
    expect(after.reminderCount).toBe(1);
    expect(after.lastReminderAt).not.toBeNull();

    // Running again in the same window does not re-send.
    const again = await sendDueReminders(orgId, NOW);
    const unchanged = await prisma.booking.findUniqueOrThrow({ where: { id: b.id } });
    expect(unchanged.reminderCount).toBe(1);
    expect(again.sent).toBe(0);
  });

  it("sends the 1h reminder and advances the counter to 2", async () => {
    const b = await mkBooking(0.5, { reminderCount: 1 }); // 30 min out, 24h already sent
    await sendDueReminders(orgId, NOW);
    const after = await prisma.booking.findUniqueOrThrow({ where: { id: b.id } });
    expect(after.reminderCount).toBe(2);
  });

  it("does not remind a call that is far out", async () => {
    const b = await mkBooking(72); // 3 days out
    await sendDueReminders(orgId, NOW);
    const after = await prisma.booking.findUniqueOrThrow({ where: { id: b.id } });
    expect(after.reminderCount).toBe(0);
  });

  it("flags a long-past confirmed call as NO_SHOW", async () => {
    const b = await mkBooking(-48); // ended ~2 days ago, still CONFIRMED
    const res = await sweepNoShows(orgId, NOW);
    expect(res.flagged).toBeGreaterThanOrEqual(1);
    const after = await prisma.booking.findUniqueOrThrow({ where: { id: b.id } });
    expect(after.status).toBe("NO_SHOW");
  });
});
