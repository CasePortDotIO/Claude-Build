import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";

/**
 * Notifications (§6): ping the operator when a call books. Slack webhook if the
 * org has one configured (stored encrypted), and always an AuditLog entry so the
 * event is recorded even with no external channel. Email notification reuses the
 * mailbox in a later pass; Slack + audit cover the headline case now.
 *
 * Best-effort: a failing webhook never breaks the booking transaction (callers
 * invoke this after commit).
 */
export async function notifyBooking(opts: {
  orgId: string;
  leadName: string;
  whenLabel: string;
  meetingUrl?: string | null;
}): Promise<{ slack: boolean }> {
  const { orgId, leadName, whenLabel, meetingUrl } = opts;

  await prisma.auditLog.create({
    data: {
      orgId,
      action: "booking.notify",
      targetType: "Booking",
      metadata: { leadName, whenLabel, meetingUrl: meetingUrl ?? null },
    },
  });

  const org = await prisma.org.findUnique({ where: { id: orgId }, select: { slackWebhookEnc: true } });
  if (!org?.slackWebhookEnc) return { slack: false };

  try {
    const url = decryptSecret(org.slackWebhookEnc);
    const text = `📅 *${leadName}* just booked a call — ${whenLabel}.${meetingUrl ? ` <${meetingUrl}|Join>` : ""} (you did nothing.)`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
    return { slack: res.ok };
  } catch {
    return { slack: false };
  }
}
