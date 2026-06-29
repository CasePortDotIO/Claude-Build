import { prisma } from "@/lib/prisma";
import { getMailboxProvider, getReadyContext } from "@/lib/mailbox";
import { formatMoney } from "@/lib/format";
import type { DailyBrief } from "@/lib/retention";

/**
 * The Morning Brief, delivered by email (M10). The Slack push only reaches orgs
 * that wired a webhook; this reaches every operator who connected a mailbox — the
 * universal daily trigger of the habit loop.
 *
 * This is a TRANSACTIONAL self-notification to the operator, NOT lead outreach,
 * so it deliberately bypasses the send pipeline's compliance footer, suppression
 * list, and daily caps — none of which apply to emailing a coach their own recap.
 * Best-effort and idempotent per day; never throws into the nightly job.
 */
export async function emailMorningBrief(orgId: string, brief: DailyBrief, streakCurrent = 0): Promise<{ emailed: number; skipped?: string }> {
  if (!brief.hasActivity) return { emailed: 0, skipped: "quiet night" };

  // Idempotent per calendar day — a re-run of the cron won't double-send.
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const already = await prisma.auditLog.findFirst({ where: { orgId, action: "brief.email", createdAt: { gte: dayStart } } });
  if (already) return { emailed: 0, skipped: "already sent today" };

  // Recipients: this workspace's operators.
  const members = await prisma.membership.findMany({ where: { orgId }, include: { user: { select: { email: true } } } });
  const recipients = [...new Set(members.map((m) => m.user.email).filter((e): e is string => Boolean(e)))];
  if (recipients.length === 0) return { emailed: 0, skipped: "no operators" };

  // Channel: a connected mailbox. (Simulation is a no-op send; real providers deliver.)
  const mailbox = await prisma.mailbox.findFirst({ where: { orgId, status: "CONNECTED" }, orderBy: { createdAt: "asc" } });
  if (!mailbox) return { emailed: 0, skipped: "no connected mailbox" };

  const org = await prisma.org.findUnique({ where: { id: orgId }, select: { name: true, brandName: true } });
  const brand = org?.brandName || org?.name || "The Warm Sweep";
  const { subject, body } = renderBrief(brief, brand, streakCurrent);

  const provider = getMailboxProvider(mailbox.provider);
  let emailed = 0;
  for (const to of recipients) {
    try {
      await provider.send(await getReadyContext(mailbox), { to, subject, body });
      emailed += 1;
    } catch {
      // best-effort per recipient
    }
  }

  await prisma.auditLog.create({
    data: { orgId, action: "brief.email", targetType: "Org", targetId: orgId, metadata: { emailed, provider: mailbox.provider } },
  });
  return { emailed };
}

/** Plain-text brief — reliable across Gmail/Microsoft without MIME gymnastics. */
export function renderBrief(brief: DailyBrief, brand: string, streakCurrent = 0): { subject: string; body: string } {
  const headline =
    brief.booked > 0
      ? `${brief.booked} call${brief.booked === 1 ? "" : "s"} booked${brief.recoveredCents > 0 ? `, ${formatMoney(brief.recoveredCents)} reactivated` : ""}`
      : brief.replied > 0
        ? `${brief.replied} lead${brief.replied === 1 ? "" : "s"} replied`
        : `${brief.drafted} draft${brief.drafted === 1 ? "" : "s"} ready`;
  const subject = `Your ${brand} brief — ${headline}`;

  const base = (process.env.NEXTAUTH_URL || "").replace(/\/$/, "");
  const lines: string[] = [
    `While you were away, your agent kept working. Here's the overnight recap:`,
    ``,
    `  • ${brief.drafted} email${brief.drafted === 1 ? "" : "s"} drafted`,
    `  • ${brief.replied} lead${brief.replied === 1 ? "" : "s"} replied`,
    `  • ${brief.booked} call${brief.booked === 1 ? "" : "s"} booked`,
  ];
  if (brief.recoveredCents > 0) {
    lines.push(`  • ${formatMoney(brief.recoveredCents)} in pipeline reactivated (${formatMoney(brief.cumulativeRecoveredCents)} all-time)`);
  }
  if (brief.latestInsight) {
    lines.push(``, `It also learned something: ${brief.latestInsight.body}`);
  }
  if (brief.pendingApprovals > 0) {
    lines.push(
      ``,
      `${brief.pendingApprovals} draft${brief.pendingApprovals === 1 ? "" : "s"} need your approval before anything sends:`,
      base ? `${base}/approvals` : `Open The Warm Sweep → Approvals`,
    );
  } else {
    lines.push(``, base ? `Start your next sweep: ${base}/leads` : `Open The Warm Sweep to start your next sweep.`);
  }
  if (streakCurrent >= 2) {
    lines.push(``, `You're on a ${streakCurrent}-day streak. Review today to keep the chain going.`);
  }
  lines.push(``, `— ${brand}`, `You're receiving this because you run a workspace here. It only sends on days with activity.`);
  return { subject, body: lines.join("\n") };
}
