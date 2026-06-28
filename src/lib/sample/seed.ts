import { prisma } from "@/lib/prisma";

/**
 * Alive-from-zero sample data. A brand-new workspace is otherwise empty —
 * every screen reads as a dead end until the first CSV import. This seeds a
 * small, believable, clearly-labeled demo so the operator can *use* the product
 * on minute one: leads to look at, drafts to approve, a live conversation, and a
 * booked call that lights up the dashboard.
 *
 * Everything is tagged source="sample" (and the mailbox/calendar are SIMULATION),
 * so clearSampleData() can remove all of it in one shot. No AI engine calls —
 * the copy is hand-written and inserted directly, so seeding is fast and never
 * depends on a provider key at sign-up time.
 */
export const SAMPLE_SOURCE = "sample";
const SAMPLE_MAILBOX = (slug: string) => `you@${slug}.sample`;

export async function seedSampleData({ orgId, operatorName }: { orgId: string; operatorName: string }): Promise<void> {
  // Idempotent: never double-seed.
  const already = await prisma.lead.count({ where: { orgId, source: SAMPLE_SOURCE } });
  if (already > 0) return;

  const org = await prisma.org.findUnique({ where: { id: orgId }, select: { slug: true } });
  const slug = org?.slug ?? "workspace";
  const sig = firstName(operatorName);

  // Simulated sending identity + calendar so messages/bookings are valid and the
  // app feels "connected" while exploring. Removed on Clear sample data.
  const mailbox = await prisma.mailbox.create({
    data: { orgId, email: SAMPLE_MAILBOX(slug), provider: "SIMULATION", status: "CONNECTED", dailyCap: 40 },
  });
  const calendar = await prisma.calendarConnection.create({
    data: { orgId, provider: "SIMULATION", status: "CONNECTED", timezone: "UTC", bookingLink: "https://cal.com/demo/intro" },
  });

  const now = Date.now();
  const days = (n: number) => new Date(now - n * 86_400_000);

  // ── Lead 1 + 2 — pending drafts for the Approvals queue ──────────────────
  const dana = await prisma.lead.create({
    data: {
      orgId, source: SAMPLE_SOURCE, email: "dana.klein@example.com", firstName: "Dana", lastName: "Klein",
      company: "Freelance", originalInquiry: "pricing on your 1:1 package", statedGoal: "replacing your day-job income with client work",
      toneRead: "warm, a little hesitant", objections: ["worried about the time commitment"], status: "DRAFTED",
      dealValueCents: 300000, lastTouchAt: days(9),
    },
  });
  const marcus = await prisma.lead.create({
    data: {
      orgId, source: SAMPLE_SOURCE, email: "marcus.bell@example.com", firstName: "Marcus", lastName: "Bell",
      company: "Bell & Co", originalInquiry: "your group program", statedGoal: "getting consistent before your big launch",
      toneRead: "direct, busy", objections: ["not sure it's worth the price"], status: "DRAFTED",
      dealValueCents: 180000, lastTouchAt: days(14),
    },
  });

  await prisma.draft.create({
    data: {
      orgId, leadId: dana.id, status: "PENDING_APPROVAL",
      variants: {
        create: [
          {
            index: 0, angle: "goal-led",
            subject: "the income goal you mentioned",
            openingLine: `Dana — back when we spoke, you said the real goal was replacing your day-job income.`,
            body: `Hi Dana,\n\nBack when we first spoke, you said the real goal was replacing your day-job income with client work — not just "trying coaching."\n\nMost people who want that stall on the same thing you mentioned: the time it takes. So I rebuilt the 1:1 around it. We'd start with the two changes that move income first, and you'd protect exactly three hours a week — no more.\n\nWorth fifteen minutes to map what your first month would look like?\n\n— ${sig}`,
            confidence: 0.88, rationale: "Leads with their own stated goal and names the exact objection (time) before they raise it.",
            voiceMatch: 0.84, voiceEcho: "Worth fifteen minutes to map it out?",
          },
          {
            index: 1, angle: "curiosity",
            subject: "a quieter way in",
            openingLine: `Dana — one thing I didn't say last time.`,
            body: `Hi Dana,\n\nOne thing I didn't get to last time: the clients who replace their income fastest almost never start by working more. They start by cutting one thing.\n\nI can show you which one in a short call — it's specific to how you described your week.\n\nWant me to send a couple of times?\n\n— ${sig}`,
            confidence: 0.79, rationale: "Open loop + a concrete, personalized promise. Lower-commitment ask.",
            voiceMatch: 0.71, voiceEcho: null,
          },
        ],
      },
    },
  });
  await prisma.draft.create({
    data: {
      orgId, leadId: marcus.id, status: "PENDING_APPROVAL",
      variants: {
        create: [
          {
            index: 0, angle: "direct",
            subject: "before your launch",
            openingLine: `Marcus — you mentioned the launch. Timing matters here.`,
            body: `Hi Marcus,\n\nYou mentioned wanting to be consistent before the launch. That window is the whole game — after it opens, you won't have the attention to spare.\n\nIf the price was the hesitation: the program pays for itself the first week you don't lose to context-switching. I can show you the math on a quick call.\n\nThis week or next?\n\n— ${sig}`,
            confidence: 0.82, rationale: "Time-anchored urgency tied to their launch; reframes price as cost-of-inaction.",
            voiceMatch: 0.77, voiceEcho: null,
          },
          {
            index: 1, angle: "goal-led",
            subject: "consistency, specifically",
            openingLine: `Marcus — "consistent" is doing a lot of work in that sentence.`,
            body: `Hi Marcus,\n\n"Consistent before the launch" can mean five different things. For founders it usually means one: a rhythm that survives a bad week.\n\nThat's the part the group program is actually built around. Happy to walk you through how it'd fit your next eight weeks.\n\nOpen to a short call?\n\n— ${sig}`,
            confidence: 0.74, rationale: "Sharpens a vague goal into a concrete promise; positions the offer as the mechanism.",
            voiceMatch: 0.7, voiceEcho: null,
          },
        ],
      },
    },
  });

  // ── Lead 3 — Priya: a live conversation (sent → positive reply) ──────────
  const priya = await prisma.lead.create({
    data: {
      orgId, source: SAMPLE_SOURCE, email: "priya.shah@example.com", firstName: "Priya", lastName: "Shah",
      originalInquiry: "the accountability cohort", statedGoal: "building a peer circle that keeps you moving",
      toneRead: "enthusiastic", status: "REPLIED", dealValueCents: 120000, lastTouchAt: days(2),
    },
  });
  const priyaConvo = await prisma.conversation.create({
    data: {
      orgId, leadId: priya.id, mailboxId: mailbox.id, threadId: `sample-priya`,
      subject: "the peer circle you asked about", status: "ACTIVE",
      lastOutboundAt: days(3), lastInboundAt: days(2),
    },
  });
  await prisma.message.createMany({
    data: [
      {
        orgId, leadId: priya.id, mailboxId: mailbox.id, conversationId: priyaConvo.id, direction: "OUTBOUND",
        status: "SENT", fromEmail: mailbox.email, toEmail: priya.email, subject: "the peer circle you asked about",
        body: `Hi Priya,\n\nYou mentioned wanting a peer circle that actually keeps you moving. I'm opening a small cohort and thought of you first — it's exactly that.\n\nWant me to hold you a seat while it's still small?\n\n— ${sig}`,
        sentAt: days(3),
      },
      {
        orgId, leadId: priya.id, mailboxId: mailbox.id, conversationId: priyaConvo.id, direction: "INBOUND",
        status: "RECEIVED", fromEmail: priya.email, toEmail: mailbox.email, subject: "Re: the peer circle you asked about",
        body: `Yes! This is exactly what I've been missing. What does it cost and when does it start?`,
        receivedAt: days(2),
      },
    ],
  });

  // ── Lead 4 — Jordan: booked call (lights up the dashboard) ───────────────
  const jordan = await prisma.lead.create({
    data: {
      orgId, source: SAMPLE_SOURCE, email: "jordan.lee@example.com", firstName: "Jordan", lastName: "Lee",
      company: "Lee Studio", originalInquiry: "the intensive", statedGoal: "shipping the thing you keep putting off",
      toneRead: "ready", status: "BOOKED", dealValueCents: 250000, lastTouchAt: days(4),
    },
  });
  const jordanConvo = await prisma.conversation.create({
    data: {
      orgId, leadId: jordan.id, mailboxId: mailbox.id, threadId: `sample-jordan`,
      subject: "let's get it on the calendar", status: "BOOKED",
      lastOutboundAt: days(5), lastInboundAt: days(4),
    },
  });
  await prisma.message.createMany({
    data: [
      {
        orgId, leadId: jordan.id, mailboxId: mailbox.id, conversationId: jordanConvo.id, direction: "OUTBOUND",
        status: "SENT", fromEmail: mailbox.email, toEmail: jordan.email, subject: "let's get it on the calendar",
        body: `Hi Jordan,\n\nYou said the goal was finally shipping the thing you keep putting off. The fastest version of that is a working session, not more planning.\n\nI've got a couple of times open this week — want me to send them?\n\n— ${sig}`,
        sentAt: days(5),
      },
      {
        orgId, leadId: jordan.id, mailboxId: mailbox.id, conversationId: jordanConvo.id, direction: "INBOUND",
        status: "RECEIVED", fromEmail: jordan.email, toEmail: mailbox.email, subject: "Re: let's get it on the calendar",
        body: `Let's do it. Thursday works.`,
        receivedAt: days(4),
      },
    ],
  });
  const start = new Date(now + 2 * 86_400_000);
  start.setHours(15, 0, 0, 0);
  const end = new Date(start.getTime() + 30 * 60_000);
  await prisma.booking.create({
    data: {
      orgId, leadId: jordan.id, conversationId: jordanConvo.id, calendarConnectionId: calendar.id,
      status: "CONFIRMED", startsAt: start, endsAt: end, attendeeEmail: jordan.email, attendeeName: "Jordan Lee",
      meetingUrl: "https://cal.com/demo/intro", source: "agent", valueCents: jordan.dealValueCents, timezone: "UTC",
    },
  });
}

/**
 * Remove every trace of the sample data: deleting the sample leads cascades to
 * their drafts/variants/messages/conversations/bookings; the sample mailbox and
 * SIMULATION calendar are removed too. Real imported leads are untouched.
 */
export async function clearSampleData(orgId: string): Promise<number> {
  const leads = await prisma.lead.findMany({ where: { orgId, source: SAMPLE_SOURCE }, select: { id: true } });
  const org = await prisma.org.findUnique({ where: { id: orgId }, select: { slug: true } });
  const slug = org?.slug ?? "workspace";

  const del = await prisma.lead.deleteMany({ where: { orgId, source: SAMPLE_SOURCE } });
  // Remove the sample mailbox + simulated calendar (cascade already cleared any
  // messages/bookings via the leads above).
  await prisma.mailbox.deleteMany({ where: { orgId, email: SAMPLE_MAILBOX(slug), provider: "SIMULATION" } });
  await prisma.calendarConnection.deleteMany({ where: { orgId, provider: "SIMULATION", bookingLink: "https://cal.com/demo/intro" } });
  void leads;
  return del.count;
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || "there";
}
