// MUST be first: loads .env before @/lib/prisma is instantiated.
import "./load-env";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { learnVoice } from "@/lib/agent/voice";
import { generateDraftsForLead } from "@/lib/agent/draft";
import { sendApprovedDraft } from "@/lib/agent/send";
import { ingestInboundEmail } from "@/lib/agent/inbound";
import { simulatedLeadReply } from "@/lib/mailbox/simulation";

const prisma = new PrismaClient();

// Seed a reseller (agency) that owns two client workspaces, each with its own
// admin + sample leads. Two separate client orgs make tenant isolation easy to
// see in the UI and is the fixture the tenancy test relies on conceptually.
async function main() {
  const passwordHash = await bcrypt.hash("warmsweep123", 10);

  // --- Agency (reseller) ---
  const agency = await prisma.org.upsert({
    where: { slug: "delegate-and-done" },
    update: {},
    create: { name: "Delegate and Done", slug: "delegate-and-done", type: "AGENCY", brandName: "Delegate and Done" },
  });

  // --- Client org A: Monroe Coaching ---
  const monroe = await prisma.org.upsert({
    where: { slug: "monroe-coaching" },
    update: {},
    create: {
      name: "Monroe Coaching",
      slug: "monroe-coaching",
      type: "CLIENT",
      parentAgencyId: agency.id,
      mailingAddress: "1200 Lakeview Dr, Austin, TX 78701",
    },
  });

  // --- Client org B: Apex Fitness (proves isolation from Monroe) ---
  const apex = await prisma.org.upsert({
    where: { slug: "apex-fitness" },
    update: {},
    create: {
      name: "Apex Fitness Studio",
      slug: "apex-fitness",
      type: "CLIENT",
      parentAgencyId: agency.id,
      mailingAddress: "55 Market St, Denver, CO 80202",
    },
  });

  const jessica = await prisma.user.upsert({
    where: { email: "jessica@monroe.coach" },
    update: { passwordHash },
    create: { name: "Jessica Monroe", email: "jessica@monroe.coach", passwordHash },
  });
  const marco = await prisma.user.upsert({
    where: { email: "marco@apexfit.co" },
    update: { passwordHash },
    create: { name: "Marco Diaz", email: "marco@apexfit.co", passwordHash },
  });

  await prisma.membership.upsert({
    where: { userId_orgId: { userId: jessica.id, orgId: monroe.id } },
    update: {},
    create: { userId: jessica.id, orgId: monroe.id, role: "CLIENT_ADMIN" },
  });
  // Jessica is also the agency admin (reseller view in M8).
  await prisma.membership.upsert({
    where: { userId_orgId: { userId: jessica.id, orgId: agency.id } },
    update: {},
    create: { userId: jessica.id, orgId: agency.id, role: "AGENCY_ADMIN" },
  });
  await prisma.membership.upsert({
    where: { userId_orgId: { userId: marco.id, orgId: apex.id } },
    update: {},
    create: { userId: marco.id, orgId: apex.id, role: "CLIENT_ADMIN" },
  });

  // Sample leads per client org.
  // Goals/inquiries are phrased as second-person noun phrases so they read
  // naturally both in the "what the agent understands" drawer and when the
  // copy engine interpolates them into a sentence.
  const monroeLeads = [
    { email: "dana.k@gmail.com", firstName: "Dana", lastName: "Klein", company: "Freelance", originalInquiry: "pricing your 1:1 coaching packages", statedGoal: "replacing your salary with coaching income", toneRead: "warm, hesitant", objections: ["worried about the time commitment"], region: "US-TX" },
    { email: "phil@growthlab.io", firstName: "Phil", lastName: "Owens", company: "GrowthLab", originalInquiry: "the 8-week accountability program", statedGoal: "staying consistent through your launch", toneRead: "direct", objections: ["not sure it's worth the price"], region: "US-CA" },
    { email: "sara.bennett@outlook.com", firstName: "Sara", lastName: "Bennett", company: "Bennett Studio", originalInquiry: "the group coaching cohort", statedGoal: "building a peer support circle", toneRead: "enthusiastic", objections: [], region: "US-NY" },
    { email: "tom.h@protonmail.com", firstName: "Tom", lastName: "Harris", originalInquiry: "the goal-setting guide you downloaded", statedGoal: "getting unstuck after a career change", toneRead: "guarded", objections: ["went quiet, never replied"], region: "UK" },
  ];
  const apexLeads = [
    { email: "rachel@fitmail.com", firstName: "Rachel", lastName: "Vance", originalInquiry: "the 90-day transformation", statedGoal: "getting in shape before your wedding", toneRead: "motivated", objections: [], region: "US-CO" },
    { email: "deepa@startup.dev", firstName: "Deepa", lastName: "Rao", company: "Startup.dev", originalInquiry: "corporate wellness for your team", statedGoal: "lowering team burnout", toneRead: "analytical", objections: ["needs buy-in from leadership"], region: "US-WA" },
  ];

  for (const l of monroeLeads) {
    await prisma.lead.upsert({
      where: { orgId_email: { orgId: monroe.id, email: l.email } },
      update: { originalInquiry: l.originalInquiry, statedGoal: l.statedGoal, toneRead: l.toneRead, objections: l.objections },
      create: { ...l, orgId: monroe.id, source: "seed", consentBasis: "PRIOR_INQUIRY", priorContact: true, status: "NEW" },
    });
  }
  for (const l of apexLeads) {
    await prisma.lead.upsert({
      where: { orgId_email: { orgId: apex.id, email: l.email } },
      update: { originalInquiry: l.originalInquiry, statedGoal: l.statedGoal, toneRead: l.toneRead, objections: l.objections },
      create: { ...l, orgId: apex.id, source: "seed", consentBasis: "PRIOR_INQUIRY", priorContact: true, status: "NEW" },
    });
  }

  // A suppression entry in Monroe so import-filtering is demonstrable.
  await prisma.suppressionEntry.upsert({
    where: { orgId_email: { orgId: monroe.id, email: "optedout@example.com" } },
    update: {},
    create: { orgId: monroe.id, email: "optedout@example.com", reason: "OPTED_OUT" },
  });

  // ── M2: learn Monroe's voice + pre-generate drafts so the app has content ──
  // Uses the real engine (deterministic stub + local embeddings when no API
  // keys are set), so memory embeddings + agent_runs are populated authentically.
  const existingProfile = await prisma.voiceProfile.findUnique({ where: { orgId: monroe.id } });
  if (!existingProfile) {
    await learnVoice({
      orgId: monroe.id,
      operatorName: "Monroe Coaching",
      samples: [
        { subject: "loved our chat", body: "Hi Dana,\n\nReally enjoyed talking through your packages. Quick thought — want me to map out a simple pricing tier you could launch this month?\n\nNo rush either way.\n\n— Jess" },
        { subject: "the launch", body: "Hey Phil,\n\nYou mentioned staying consistent through your launch. I put together a short accountability rhythm that works for founders. Want me to send it?\n\n— Jess" },
        { body: "Hi Sara,\n\nThe cohort idea you raised stuck with me. I think a small peer circle would suit you. Open to a quick call to sketch it out?\n\n— Jess" },
      ],
    });
  }

  // Draft for two Monroe leads so the Approvals queue isn't empty (idempotent:
  // only if there are no pending drafts yet).
  const pendingCount = await prisma.draft.count({ where: { orgId: monroe.id, status: "PENDING_APPROVAL" } });
  if (pendingCount === 0) {
    const monroeNewLeads = await prisma.lead.findMany({
      where: { orgId: monroe.id, status: { in: ["NEW", "RESEARCHED"] } },
      take: 2,
      orderBy: { createdAt: "asc" },
    });
    for (const lead of monroeNewLeads) {
      await generateDraftsForLead({ orgId: monroe.id, leadId: lead.id, operatorName: "Monroe Coaching" });
    }
  }

  // ── M3: connect a simulated mailbox, send the approved drafts, simulate a reply
  // so the Conversations screen is populated on first load.
  const simEmail = "demo@monroe-coaching.sim";
  const mailbox = await prisma.mailbox.upsert({
    where: { orgId_email: { orgId: monroe.id, email: simEmail } },
    update: { status: "CONNECTED" },
    create: { orgId: monroe.id, email: simEmail, provider: "SIMULATION", status: "CONNECTED", dailyCap: 40 },
  });

  const noConversations = (await prisma.conversation.count({ where: { orgId: monroe.id } })) === 0;
  if (noConversations) {
    // Approve + send the two pending drafts (pick the highest-confidence variant).
    const pending = await prisma.draft.findMany({
      where: { orgId: monroe.id, status: "PENDING_APPROVAL" },
      include: { variants: { orderBy: { confidence: "desc" } } },
    });
    for (const draft of pending) {
      const best = draft.variants[0];
      if (!best) continue;
      await prisma.draft.update({
        where: { id: draft.id },
        data: { status: "APPROVED", selectedVariantId: best.id, finalSubject: best.subject, finalBody: best.body, approvedAt: new Date() },
      });
      await prisma.lead.update({ where: { id: draft.leadId }, data: { status: "SCHEDULED" } });
      await sendApprovedDraft({ orgId: monroe.id, draftId: draft.id });
    }

    // Simulate a positive reply from the first lead (Dana) → agent drafts a reply.
    const dana = await prisma.lead.findFirst({ where: { orgId: monroe.id, email: "dana.k@gmail.com" } });
    const danaConvo = dana ? await prisma.conversation.findUnique({ where: { leadId: dana.id } }) : null;
    if (dana && danaConvo) {
      await ingestInboundEmail({
        orgId: monroe.id,
        mailboxId: mailbox.id,
        email: {
          providerMessageId: `seed-reply-${dana.id}`,
          threadId: danaConvo.threadId ?? `simthread-${dana.id}`,
          fromEmail: `${dana.firstName} <${dana.email}>`,
          toEmail: simEmail,
          subject: `Re: ${danaConvo.subject}`,
          body: simulatedLeadReply({ firstName: dana.firstName, goal: dana.statedGoal, positive: true }),
          receivedAt: new Date(),
        },
      });
    }
  }

  console.log("Seed complete:");
  console.log("  Agency:  Delegate and Done");
  console.log("  Client A: Monroe Coaching  — login jessica@monroe.coach / warmsweep123  (4 leads)");
  console.log("  Client B: Apex Fitness     — login marco@apexfit.co   / warmsweep123  (2 leads)");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
