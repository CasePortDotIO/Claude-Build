import { prisma } from "@/lib/prisma";
import { BOOKED_STATUSES } from "@/lib/booking-status";

// Command Center metrics + activity feed, all org-scoped. Pure reads.

export interface CommandCenterKpis {
  recoveredRevenueCents: number;
  callsBooked: number;
  replyRate: number; // 0..1
  contacted: number;
  replied: number;
  activeConversations: number;
}

export async function commandCenterKpis(orgId: string): Promise<CommandCenterKpis> {
  const [revenue, callsBooked, contacted, replied, active] = await Promise.all([
    prisma.booking.aggregate({ where: { orgId, status: { in: BOOKED_STATUSES } }, _sum: { valueCents: true } }),
    prisma.booking.count({ where: { orgId, status: { in: BOOKED_STATUSES } } }),
    // "Contacted" = at least one outbound message went out.
    prisma.message.findMany({ where: { orgId, direction: "OUTBOUND" }, distinct: ["leadId"], select: { leadId: true } }),
    prisma.message.findMany({ where: { orgId, direction: "INBOUND", isAutoReply: false, isBounce: false }, distinct: ["leadId"], select: { leadId: true } }),
    prisma.conversation.count({ where: { orgId, status: { in: ["ACTIVE", "AWAITING_REPLY", "NEEDS_REVIEW"] } } }),
  ]);

  const contactedN = contacted.length;
  const repliedN = replied.length;
  return {
    recoveredRevenueCents: revenue._sum.valueCents ?? 0,
    callsBooked,
    replyRate: contactedN ? repliedN / contactedN : 0,
    contacted: contactedN,
    replied: repliedN,
    activeConversations: active,
  };
}

// M9: first-run progress. Drives the guided "first sweep" checklist on the
// Command Center until the operator has taken a lead all the way to a send.
export interface FirstRunState {
  mailboxConnected: boolean;
  leadsImported: boolean;
  draftsGenerated: boolean;
  firstSent: boolean;
  complete: boolean; // all four done — hide the guide
  leadCount: number;
}

export async function firstRunState(orgId: string): Promise<FirstRunState> {
  const [mailbox, leadCount, draftCount, sentCount] = await Promise.all([
    prisma.mailbox.count({ where: { orgId, status: "CONNECTED" } }),
    prisma.lead.count({ where: { orgId } }),
    prisma.draft.count({ where: { orgId } }),
    prisma.message.count({ where: { orgId, direction: "OUTBOUND" } }),
  ]);
  const mailboxConnected = mailbox > 0;
  const leadsImported = leadCount > 0;
  const draftsGenerated = draftCount > 0;
  const firstSent = sentCount > 0;
  return {
    mailboxConnected,
    leadsImported,
    draftsGenerated,
    firstSent,
    complete: mailboxConnected && leadsImported && draftsGenerated && firstSent,
    leadCount,
  };
}

// M9: the most recent booking, for the "you just recovered $X" celebration.
export interface LatestBooking {
  id: string;
  name: string;
  valueCents: number;
  bookedAt: Date;
  coldFor: string | null; // how long the lead had been dormant before booking
}

export async function latestBooking(orgId: string): Promise<LatestBooking | null> {
  const b = await prisma.booking.findFirst({
    where: { orgId, status: { in: BOOKED_STATUSES } },
    orderBy: { createdAt: "desc" },
    include: { lead: { select: { firstName: true, lastName: true, email: true, createdAt: true } } },
  });
  if (!b) return null;
  const name = [b.lead.firstName, b.lead.lastName].filter(Boolean).join(" ") || b.lead.email;
  const coldMs = b.createdAt.getTime() - b.lead.createdAt.getTime();
  const coldDays = Math.floor(coldMs / 86_400_000);
  const coldFor = coldDays >= 1 ? (coldDays >= 30 ? `${Math.floor(coldDays / 30)}mo` : `${coldDays}d`) : null;
  return { id: b.id, name, valueCents: b.valueCents, bookedAt: b.createdAt, coldFor };
}

// 7-day reactivations chart: bookings per day (most recent last).
export interface ChartBar {
  day: string;
  value: number;
}
export async function reactivationsChart(orgId: string, days = 7): Promise<ChartBar[]> {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - (days - 1));

  const bookings = await prisma.booking.findMany({
    where: { orgId, createdAt: { gte: since } },
    select: { createdAt: true },
  });

  const buckets: ChartBar[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(since);
    d.setDate(since.getDate() + i);
    const label = d.toLocaleDateString("en-US", { weekday: "short" });
    const count = bookings.filter((b) => sameDay(b.createdAt, d)).length;
    buckets.push({ day: label, value: count });
  }
  return buckets;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// Unified live activity feed: bookings, sends, replies, agent runs — merged + sorted.
export interface ActivityItem {
  id: string;
  kind: "booking" | "sent" | "reply" | "agent" | "opt_out";
  text: string;
  at: Date;
}

export async function activityFeed(orgId: string, limit = 8): Promise<ActivityItem[]> {
  const [bookings, messages, runs] = await Promise.all([
    prisma.booking.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { lead: { select: { firstName: true, lastName: true, email: true } } },
    }),
    prisma.message.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
      take: limit * 2,
      include: { lead: { select: { firstName: true, lastName: true, email: true } } },
    }),
    prisma.agentRun.findMany({ where: { orgId, step: { in: ["DRAFT", "REPLY", "VOICE_LEARN"] } }, orderBy: { createdAt: "desc" }, take: limit }),
  ]);

  const name = (l: { firstName: string | null; lastName: string | null; email: string }) =>
    [l.firstName, l.lastName].filter(Boolean).join(" ") || l.email;

  const items: ActivityItem[] = [];
  for (const b of bookings) items.push({ id: `b-${b.id}`, kind: "booking", text: `${name(b.lead)} booked a call`, at: b.createdAt });
  for (const m of messages) {
    if (m.direction === "OUTBOUND") items.push({ id: `m-${m.id}`, kind: "sent", text: `Sent to ${name(m.lead)}`, at: m.createdAt });
    else if (m.isOptOut) items.push({ id: `m-${m.id}`, kind: "opt_out", text: `${name(m.lead)} opted out — suppressed`, at: m.createdAt });
    else if (!m.isBounce && !m.isAutoReply) items.push({ id: `m-${m.id}`, kind: "reply", text: `${name(m.lead)} replied`, at: m.createdAt });
  }
  for (const r of runs) {
    const label = r.step === "DRAFT" ? "Drafted a re-engagement email" : r.step === "REPLY" ? "Drafted a reply" : "Refined the voice profile";
    items.push({ id: `r-${r.id}`, kind: "agent", text: label, at: r.createdAt });
  }

  return items.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}
