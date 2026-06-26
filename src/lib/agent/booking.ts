import { prisma } from "@/lib/prisma";
import { getCalendarProvider, calendarContext } from "@/lib/calendar";
import { transition, canTransition } from "@/lib/agent/state-machine";
import { notifyBooking } from "@/lib/notify";
import { slotLabel } from "@/lib/calendar/slots";

export class BookingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BookingError";
  }
}

/** The org's connected calendar (or null). */
export async function activeCalendar(orgId: string) {
  return prisma.calendarConnection.findFirst({ where: { orgId, status: "CONNECTED" }, orderBy: { createdAt: "asc" } });
}

/** Real bookable slots the agent may offer in copy (empty if no calendar / LINK). */
export async function availabilityLabels(orgId: string, max = 4): Promise<string[]> {
  const cal = await activeCalendar(orgId);
  if (!cal) return [];
  try {
    const slots = await getCalendarProvider(cal.provider).getAvailability(calendarContext(cal));
    return slots.slice(0, max).map((s) => s.label);
  } catch {
    return [];
  }
}

/**
 * Book a call for a lead — the terminal success of the loop.
 *
 * Creates the calendar event (via the connected provider), records the Booking,
 * advances the lead → BOOKED and conversation → BOOKED, snapshots the deal value
 * for the recovered-revenue KPI, and fires the booking notification.
 *
 * Hard rails: refuse if the lead is opted-out / DNC / bounced, or already booked.
 */
export async function bookCall(opts: {
  orgId: string;
  leadId: string;
  startsAt: Date;
  endsAt?: Date;
  source?: "agent" | "link" | "webhook";
  providerEventId?: string;
  meetingUrl?: string | null;
}) {
  const { orgId, leadId, startsAt, source = "agent" } = opts;
  const endsAt = opts.endsAt ?? new Date(startsAt.getTime() + 30 * 60_000);

  const lead = await prisma.lead.findFirst({ where: { id: leadId, orgId } });
  if (!lead) throw new BookingError("Lead not found in this workspace.");
  if (lead.status === "BOOKED") throw new BookingError("Lead already has a booked call.");
  if (["OPTED_OUT", "DO_NOT_CONTACT", "BOUNCED"].includes(lead.status)) {
    throw new BookingError(`Lead is ${lead.status} — booking is blocked by compliance rails.`);
  }

  const cal = await activeCalendar(orgId);
  const convo = await prisma.conversation.findUnique({ where: { leadId } });

  // Create the real event unless it came from a webhook (already created) or LINK.
  let providerEventId = opts.providerEventId;
  let meetingUrl = opts.meetingUrl ?? null;
  if (source === "agent" && cal && cal.provider !== "LINK") {
    const created = await getCalendarProvider(cal.provider).createBooking(calendarContext(cal), {
      startsAt,
      endsAt,
      attendeeEmail: lead.email,
      attendeeName: [lead.firstName, lead.lastName].filter(Boolean).join(" ") || undefined,
    });
    providerEventId = created.providerEventId;
    meetingUrl = created.meetingUrl ?? null;
  }

  const booking = await prisma.$transaction(async (tx) => {
    const b = await tx.booking.create({
      data: {
        orgId,
        leadId,
        conversationId: convo?.id,
        calendarConnectionId: cal?.id,
        status: "CONFIRMED",
        startsAt,
        endsAt,
        attendeeEmail: lead.email,
        attendeeName: [lead.firstName, lead.lastName].filter(Boolean).join(" ") || null,
        meetingUrl,
        providerEventId,
        source,
        valueCents: lead.dealValueCents,
      },
    });

    // Lead → BOOKED (force terminal even from an unexpected source state).
    const to = canTransition(lead.status, "BOOK") ? transition(lead.status, "BOOK") : "BOOKED";
    await tx.lead.update({ where: { id: leadId }, data: { status: to } });

    if (convo) {
      await tx.conversation.update({ where: { id: convo.id }, data: { status: "BOOKED" } });
      // Any pending reply draft is moot once the call is booked.
      await tx.draft.updateMany({ where: { orgId, leadId, status: "PENDING_APPROVAL" }, data: { status: "SUPERSEDED" } });
    }

    await tx.auditLog.create({
      data: { orgId, action: "booking.create", targetType: "Booking", targetId: b.id, metadata: { source, startsAt: startsAt.toISOString() } },
    });
    return b;
  });

  // Notify after commit (best-effort; never blocks the booking).
  const name = [lead.firstName, lead.lastName].filter(Boolean).join(" ") || lead.email;
  await notifyBooking({ orgId, leadName: name, whenLabel: slotLabel(startsAt), meetingUrl });

  return booking;
}
