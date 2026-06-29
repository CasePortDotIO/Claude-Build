import { prisma } from "@/lib/prisma";
import { getMailboxProvider, getReadyContext } from "@/lib/mailbox";

/**
 * §6 no-show defense. A "booked call" that no-shows is junk that triggers
 * refunds, so every booking gets a confirmation + a timed reminder sequence
 * (24h and 1h before), each carrying a one-click reschedule link. Reminders are
 * transactional messages to someone who just booked a call with us — not
 * marketing — so they bypass the suppression/compliance-footer path, like the
 * operator digest. Best-effort; never throws into the booking or the cron.
 */

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

function fmtWhen(date: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "long",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZoneName: "short",
    }).format(date);
  } catch {
    return date.toUTCString();
  }
}

async function emailAttendee(orgId: string, to: string, subject: string, body: string): Promise<boolean> {
  const mailbox = await prisma.mailbox.findFirst({ where: { orgId, status: "CONNECTED" }, orderBy: { createdAt: "asc" } });
  if (!mailbox) return false;
  try {
    await getMailboxProvider(mailbox.provider).send(await getReadyContext(mailbox), { to, subject, body });
    return true;
  } catch {
    return false;
  }
}

async function rescheduleLine(booking: { calendarConnectionId: string | null; meetingUrl: string | null }): Promise<string> {
  let link: string | null = booking.meetingUrl;
  if (booking.calendarConnectionId) {
    const cal = await prisma.calendarConnection.findUnique({ where: { id: booking.calendarConnectionId }, select: { bookingLink: true } });
    link = cal?.bookingLink ?? link;
  }
  return link ? `Need a different time? Reschedule here: ${link}` : `Need a different time? Just reply and we'll sort it.`;
}

/** Confirmation email immediately after a call is booked. */
export async function sendBookingConfirmation(bookingId: string): Promise<{ sent: boolean }> {
  const b = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { org: { select: { brandName: true, name: true } } },
  });
  if (!b || b.status === "CANCELED") return { sent: false };
  const brand = b.org.brandName || b.org.name;
  const when = fmtWhen(b.startsAt, b.timezone ?? "UTC");
  const body = [
    `You're confirmed for ${when}.`,
    b.meetingUrl ? `\nJoin: ${b.meetingUrl}` : "",
    `\n${await rescheduleLine(b)}`,
    `\n— ${brand}`,
  ].filter(Boolean).join("\n");
  return { sent: await emailAttendee(b.orgId, b.attendeeEmail, `Confirmed: your call on ${when}`, body) };
}

/**
 * Send any due reminders for an org's upcoming calls. Window tracking via
 * reminderCount: 0 = none sent, 1 = the 24h reminder sent, 2 = the 1h reminder
 * sent. Run on the cron; idempotent within a window.
 */
export async function sendDueReminders(orgId: string, now: Date = new Date()): Promise<{ sent: number }> {
  const upcoming = await prisma.booking.findMany({
    where: { orgId, status: "CONFIRMED", startsAt: { gt: now }, reminderCount: { lt: 2 } },
    include: { org: { select: { brandName: true, name: true } } },
    take: 200,
  });

  let sent = 0;
  for (const b of upcoming) {
    const untilStart = b.startsAt.getTime() - now.getTime();
    let window: 1 | 2 | null = null;
    if (untilStart <= HOUR_MS && b.reminderCount < 2) window = 2; // 1h
    else if (untilStart <= DAY_MS && b.reminderCount < 1) window = 1; // 24h
    if (!window) continue;

    const brand = b.org.brandName || b.org.name;
    const when = fmtWhen(b.startsAt, b.timezone ?? "UTC");
    const lede = window === 2 ? `Quick reminder — your call is in about an hour, at ${when}.` : `Reminder: your call is tomorrow, ${when}.`;
    const body = [lede, b.meetingUrl ? `\nJoin: ${b.meetingUrl}` : "", `\n${await rescheduleLine(b)}`, `\n— ${brand}`].filter(Boolean).join("\n");

    if (await emailAttendee(b.orgId, b.attendeeEmail, `Reminder: call ${when}`, body)) {
      await prisma.booking.update({ where: { id: b.id }, data: { reminderCount: window, lastReminderAt: now } });
      sent += 1;
    }
  }
  return { sent };
}

/**
 * Flag stale confirmed bookings as NO_SHOW once they're well past their end time
 * and were never marked SHOWED. A default the operator can correct; without
 * attendance data we assume no-show after a generous grace, so the guarantee's
 * show-rate isn't silently inflated by un-reconciled past calls.
 */
export async function sweepNoShows(orgId: string, now: Date = new Date(), graceHours = 12): Promise<{ flagged: number }> {
  const cutoff = new Date(now.getTime() - graceHours * HOUR_MS);
  const res = await prisma.booking.updateMany({
    where: { orgId, status: "CONFIRMED", endsAt: { lt: cutoff } },
    data: { status: "NO_SHOW" },
  });
  return { flagged: res.count };
}
