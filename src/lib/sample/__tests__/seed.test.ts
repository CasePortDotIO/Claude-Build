import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { seedSampleData, clearSampleData, SAMPLE_SOURCE } from "@/lib/sample/seed";
import { firstRunState } from "@/lib/metrics";

/**
 * DB-backed test for alive-from-zero sample data. Verifies:
 *  - seeding populates every screen's data (leads, pending drafts, conversations,
 *    a booking) and is idempotent,
 *  - a real (non-sample) lead is never touched by clearSampleData,
 *  - clearing removes all sample rows via cascade.
 */
describe("sample data seed/clear", () => {
  const tag = `sample-${Math.random().toString(36).slice(2, 8)}`;
  let orgId: string;

  beforeAll(async () => {
    const org = await prisma.org.create({ data: { name: `Org ${tag}`, slug: `org-${tag}`, type: "CLIENT" } });
    orgId = org.id;
    // A real imported lead that must survive a sample clear.
    await prisma.lead.create({ data: { orgId, email: `real@${tag}.com`, firstName: "Real", source: "csv" } });
  });

  afterAll(async () => {
    await prisma.message.deleteMany({ where: { orgId } });
    await prisma.booking.deleteMany({ where: { orgId } });
    await prisma.draft.deleteMany({ where: { orgId } });
    await prisma.conversation.deleteMany({ where: { orgId } });
    await prisma.mailbox.deleteMany({ where: { orgId } });
    await prisma.calendarConnection.deleteMany({ where: { orgId } });
    await prisma.lead.deleteMany({ where: { orgId } });
    await prisma.org.deleteMany({ where: { id: orgId } });
    await prisma.$disconnect();
  });

  it("seeds explorable data across every screen and is idempotent", async () => {
    await seedSampleData({ orgId, operatorName: "Jess Monroe" });
    // Second call must not duplicate.
    await seedSampleData({ orgId, operatorName: "Jess Monroe" });

    expect(await prisma.lead.count({ where: { orgId, source: SAMPLE_SOURCE } })).toBe(4);
    expect(await prisma.draft.count({ where: { orgId, status: "PENDING_APPROVAL" } })).toBe(2);
    expect(await prisma.conversation.count({ where: { orgId } })).toBe(2);
    expect(await prisma.booking.count({ where: { orgId } })).toBe(1);
    expect(await prisma.mailbox.count({ where: { orgId, status: "CONNECTED" } })).toBe(1);
    // No calendar is pre-connected — onboarding must still prompt for the real one.
    expect(await prisma.calendarConnection.count({ where: { orgId } })).toBe(0);

    // Sample data must NOT count as real onboarding progress — firstRunState
    // excludes the `.sample` mailbox and source="sample" leads. (The real CSV
    // lead seeded in beforeAll keeps leadsImported true; the rest stay false.)
    const fr = await firstRunState(orgId);
    expect(fr.mailboxConnected).toBe(false);
    expect(fr.draftsGenerated).toBe(false);
    expect(fr.firstSent).toBe(false);
    expect(fr.complete).toBe(false);
  });

  it("clears all sample data but leaves real leads untouched", async () => {
    const removed = await clearSampleData(orgId);
    expect(removed).toBe(4);

    expect(await prisma.lead.count({ where: { orgId, source: SAMPLE_SOURCE } })).toBe(0);
    expect(await prisma.draft.count({ where: { orgId } })).toBe(0);
    expect(await prisma.conversation.count({ where: { orgId } })).toBe(0);
    expect(await prisma.booking.count({ where: { orgId } })).toBe(0);
    // The real CSV lead remains.
    expect(await prisma.lead.count({ where: { orgId, source: "csv" } })).toBe(1);
  });
});
