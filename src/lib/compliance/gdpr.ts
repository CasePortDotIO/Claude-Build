import { prisma } from "@/lib/prisma";

/**
 * GDPR/CASL per-lead data rights (§9): export and erasure.
 *
 * Export — everything we hold about a lead, as a portable JSON object.
 * Erasure — delete the lead and all its personal data (cascades to messages,
 * drafts, bookings, memory, conversation), and add the email to the suppression
 * list as DO_NOT_CONTACT so a future import can't silently re-contact them.
 */

export async function exportLead(orgId: string, leadId: string) {
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, orgId },
    include: {
      drafts: { include: { variants: true } },
      messages: true,
      bookings: true,
      conversation: true,
      memoryEmbeddings: { select: { id: true, kind: true, content: true, createdAt: true } },
      agentRuns: { select: { id: true, step: true, inputSummary: true, createdAt: true } },
    },
  });
  if (!lead) return null;

  return {
    exportedAt: new Date().toISOString(),
    lead: {
      email: lead.email,
      firstName: lead.firstName,
      lastName: lead.lastName,
      company: lead.company,
      phone: lead.phone,
      region: lead.region,
      consentBasis: lead.consentBasis,
      status: lead.status,
      originalInquiry: lead.originalInquiry,
      statedGoal: lead.statedGoal,
      objections: lead.objections,
      createdAt: lead.createdAt,
    },
    conversation: lead.conversation,
    messages: lead.messages.map((m) => ({ direction: m.direction, subject: m.subject, body: m.body, at: m.createdAt })),
    drafts: lead.drafts.map((d) => ({ status: d.status, variants: d.variants.map((v) => ({ angle: v.angle, subject: v.subject, body: v.body })) })),
    bookings: lead.bookings.map((b) => ({ startsAt: b.startsAt, status: b.status })),
    memory: lead.memoryEmbeddings,
    agentRuns: lead.agentRuns,
  };
}

export async function eraseLead(orgId: string, leadId: string): Promise<{ erased: boolean; email?: string }> {
  const lead = await prisma.lead.findFirst({ where: { id: leadId, orgId }, select: { id: true, email: true } });
  if (!lead) return { erased: false };

  await prisma.$transaction(async (tx) => {
    // Suppress first (so the email stays on the do-not-contact list post-erasure).
    await tx.suppressionEntry.upsert({
      where: { orgId_email: { orgId, email: lead.email } },
      create: { orgId, email: lead.email, reason: "DO_NOT_CONTACT", note: "GDPR erasure" },
      update: { reason: "DO_NOT_CONTACT" },
    });
    // Deleting the lead cascades to messages/drafts/bookings/memory/conversation.
    await tx.lead.delete({ where: { id: lead.id } });
    await tx.auditLog.create({ data: { orgId, action: "lead.erase", targetType: "Lead", metadata: { email: lead.email } } });
  });

  return { erased: true, email: lead.email };
}
