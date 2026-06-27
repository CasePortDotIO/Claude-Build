import { prisma } from "@/lib/prisma";
import { getCalendarProvider, calendarContext } from "@/lib/calendar";
import { transition, canTransition } from "@/lib/agent/state-machine";
import { assertContactable, ComplianceError } from "@/lib/compliance";
import { notifyBooking } from "@/lib/notify";
import { slotLabel } from "@/lib/calendar/slots";
import { validateBookingSlot } from "@/lib/calendar/validate";
import { sendBookingConfirmation } from "@/lib/agent/reminders";
import { ACTIVE_SLOT_STATUSES } from "@/lib/booking-status";

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
  // Single contactability gate (status + suppression table) — same as draft/send,
  // so a suppressed email can't be booked even via the self-serve webhook.
  try {
    await assertContactable(orgId, lead.email, lead.status);
  } catch (e) {
    if (e instanceof ComplianceError) throw new BookingError(e.message);
    throw e;
  }

  const cal = await activeCalendar(orgId);
  const convo = await prisma.conversation.findUnique({ where: { leadId } });

  // §6: validate the slot. No-double-book + not-in-the-past apply from EVERY
  // source; business-hours/buffer are enforced for agent-proposed times (self-
  // booked webhook/link slots were already vetted by the external provider).
  const others = await prisma.booking.findMany({
    where: { orgId, status: { in: ACTIVE_SLOT_STATUSES }, leadId: { not: leadId } },
    select: { startsAt: true, endsAt: true },
  });
  const tz = cal?.timezone ?? "UTC";
  const check = validateBookingSlot({
    startsAt,
    endsAt,
    rules: {
      timezone: tz,
      businessStartHour: cal?.businessStartHour ?? 9,
      businessEndHour: cal?.businessEndHour ?? 17,
      bufferMin: cal?.bufferMin ?? 0,
      allowOutOfHours: cal?.allowOutOfHours ?? false,
    },
    existing: others,
    enforceHours: source === "agent",
  });
  if (!check.ok) throw new BookingError(`Can't book that slot — ${check.reason}.`);

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
        timezone: tz,
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

  // Notify the operator + send the attendee a confirmation (both best-effort).
  const name = [lead.firstName, lead.lastName].filter(Boolean).join(" ") || lead.email;
  await notifyBooking({ orgId, leadName: name, whenLabel: slotLabel(startsAt), meetingUrl });
  await sendBookingConfirmation(booking.id).catch(() => {});

  return booking;
}
