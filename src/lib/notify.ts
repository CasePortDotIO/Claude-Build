import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import { formatMoney } from "@/lib/format";
import type { DailyBrief } from "@/lib/retention";

/** Post raw text to the org's Slack webhook if one is configured. Best-effort. */
async function postSlack(orgId: string, text: string): Promise<boolean> {
  const org = await prisma.org.findUnique({ where: { id: orgId }, select: { slackWebhookEnc: true } });
  if (!org?.slackWebhookEnc) return false;
  try {
    const url = decryptSecret(org.slackWebhookEnc);
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * The Morning Brief, pushed to Slack by the nightly job (M10). This is the
 * external trigger of the habit loop — it pulls the operator back in each day
 * with the overnight story. Skips silently on quiet nights so it never nags.
 */
export async function notifyMorningBrief(orgId: string, brief: DailyBrief, streakCurrent = 0): Promise<{ slack: boolean }> {
  if (!brief.hasActivity) return { slack: false };
  const lines = [
    `*Your Warm Sweep — overnight brief*`,
    `• ${brief.drafted} drafted · ${brief.replied} replied · ${brief.booked} booked`,
  ];
  if (brief.recoveredCents > 0) lines.push(`• ${formatMoney(brief.recoveredCents)} reactivated (${formatMoney(brief.cumulativeRecoveredCents)} all-time)`);
  if (brief.latestInsight) lines.push(`• Learned: ${brief.latestInsight.body}`);
  if (brief.pendingApprovals > 0) lines.push(`• ${brief.pendingApprovals} draft${brief.pendingApprovals === 1 ? "" : "s"} awaiting your review`);
  if (streakCurrent >= 2) lines.push(`• ${streakCurrent}-day review streak — keep it going`);
  return { slack: await postSlack(orgId, lines.join("\n")) };
}

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
    const text = `*${leadName}* booked a call — ${whenLabel}.${meetingUrl ? ` <${meetingUrl}|Join>` : ""}`;
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
