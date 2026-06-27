import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { sendApprovedDraft, SendError } from "@/lib/agent/send";

/**
 * §9: a canceled workspace must halt sending immediately. We assert the send
 * pipeline refuses before it ever touches a mailbox.
 */
describe("§9 cancellation halts sending", () => {
  const tag = `cxl-${Math.random().toString(36).slice(2, 8)}`;
  let orgId: string;
  let draftId: string;

  beforeAll(async () => {
    const org = await prisma.org.create({
      data: { name: `Org ${tag}`, slug: `org-${tag}`, type: "CLIENT", billingStatus: "canceled", mailingAddress: "1 Main St" },
    });
    orgId = org.id;
    const lead = await prisma.lead.create({ data: { orgId, email: `l-${tag}@x.com`, status: "SCHEDULED" } });
    const draft = await prisma.draft.create({
      data: { orgId, leadId: lead.id, status: "APPROVED", finalSubject: "Hi", finalBody: "Body" },
    });
    draftId = draft.id;
  });

  afterAll(async () => {
    await prisma.org.delete({ where: { id: orgId } }).catch(() => {});
  });

  it("refuses to send for a canceled org", async () => {
    await expect(sendApprovedDraft({ orgId, draftId })).rejects.toBeInstanceOf(SendError);
    await expect(sendApprovedDraft({ orgId, draftId })).rejects.toThrow(/canceled/i);
  });

  it("sends again once reactivated", async () => {
    // Flip to active; now it should fail for a DIFFERENT reason (no mailbox), not billing.
    await prisma.org.update({ where: { id: orgId }, data: { billingStatus: "active", canceledAt: null } });
    await expect(sendApprovedDraft({ orgId, draftId })).rejects.toThrow(/mailbox|mailing address/i);
  });
});
