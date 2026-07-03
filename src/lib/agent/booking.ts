import { prisma } from "@/lib/prisma";
import { getCalendarProvider, calendarContext } from "@/lib/calendar";
import { transition, canTransition } from "@/lib/agent/state-machine";
import { assertContactable, ComplianceError } from "@/lib/compliance";
import { notifyBooking } from "@/lib/notify";
import { createNotification } from "@/lib/notifications";
import { slotLabel } from "@/lib/calendar/slots";
import { validateBookingSlot } from "@/lib/calendar/validate";
import { sendBookingConfirmation } from "@/lib/agent/reminders";
import { ACTIVE_SLOT_STATUSES } from "@/lib/booking-status";
import { recordOutcome } from "@/lib/outcomes";
import { endTrialNow } from "@/lib/billing/stripe";
import { reportError } from "@/lib/observability/report";

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
  await createNotification({ orgId, kind: "CALL_BOOKED", title: `Call booked with ${name}`, body: slotLabel(startsAt), actionUrl: `/leads?id=${leadId}` });
  await sendBookingConfirmation(booking.id).catch(() => {});
  // §10: a booked call is the headline conversion.
  await recordOutcome({ orgId, leadId, kind: "BOOKED", valueCents: lead.dealValueCents });

  // Result-gated $0 trial → paid. When the agent books the Nth call during the
  // trial, end the trial early so Stripe charges the card on file. Best-effort:
  // never let a billing side effect break the booking that just succeeded.
  await maybeConvertTrial(orgId).catch((err) => reportError(err, { source: "trial-convert", orgId }));

  return booking;
}

/**
 * Convert a result-gated $0 trial into a paid subscription once the agent has
 * booked the org's threshold number of calls. Charges the card on file by ending
 * the Stripe trial early; the resulting `customer.subscription.updated` webhook
 * flips billingStatus to "active".
 *
 * Idempotent + race-safe: the conversion is claimed with a conditional write
 * (trialConvertedAt was null) so two calls booked at once can't double-charge.
 */
async function maybeConvertTrial(orgId: string): Promise<void> {
  const org = await prisma.org.findUnique({
    where: { id: orgId },
    select: { billingStatus: true, trialCallThreshold: true, trialStartedAt: true, trialConvertedAt: true, stripeSubscriptionId: true },
  });
  if (!org || org.billingStatus !== "trial" || org.trialConvertedAt) return;
  const threshold = org.trialCallThreshold ?? 0;
  if (threshold <= 0 || !org.stripeSubscriptionId) return;

  // Count real (confirmed) calls booked since the trial began.
  const booked = await prisma.booking.count({
    where: {
      orgId,
      status: { in: ACTIVE_SLOT_STATUSES },
      ...(org.trialStartedAt ? { createdAt: { gte: org.trialStartedAt } } : {}),
    },
  });
  if (booked < threshold) return;

  // Claim the conversion atomically — only one booking wins the race.
  const claimed = await prisma.org.updateMany({
    where: { id: orgId, trialConvertedAt: null, billingStatus: "trial" },
    data: { trialConvertedAt: new Date() },
  });
  if (claimed.count === 0) return;

  try {
    await endTrialNow(org.stripeSubscriptionId);
  } catch (err) {
    // Release the claim so a later booking can retry the charge.
    await prisma.org.update({ where: { id: orgId }, data: { trialConvertedAt: null } }).catch(() => {});
    throw err;
  }

  await createNotification({
    orgId,
    kind: "TRIAL_CONVERTED",
    title: "Your Warm Sweep just paid for itself",
    body: `The agent booked ${threshold} calls — your plan is now live.`,
    actionUrl: "/",
  });
}
