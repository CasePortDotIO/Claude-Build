import { prisma } from "@/lib/prisma";
import { BOOKED_STATUSES } from "@/lib/booking-status";

/**
 * Onboarding activation (p8) — turn payment → first booked call, fast. The build
 * tracker walks the buyer through four stages with the promised SLAs, and the
 * quick-wins reveal the 3 warmest leads with a copy-paste opener each the moment
 * intake is submitted. Stage is computed from real signals (leads, drafts, sends,
 * bookings) so the tracker can never lie about where the sweep actually is.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// The activation SLAs promised at checkout, measured from intake submission.
export const SLA = { buildHours: 48, outreachHours: 72, activeDays: 7 } as const;
// The guarantee needs a real list; the intake asks for at least this many.
export const MIN_LIST = 50;

export type OnboardingStage = "INTAKE" | "BUILDING" | "OUTREACH" | "LIVE";
const ORDER: OnboardingStage[] = ["INTAKE", "BUILDING", "OUTREACH", "LIVE"];

export interface OnboardingStatus {
  stage: OnboardingStage;
  submitted: boolean;
  submittedAt: Date | null;
  idealClient: string | null;
  leadCount: number;
  hasBookingLink: boolean;
  // SLA deadlines (null until intake is submitted).
  deadlines: { buildBy: Date | null; outreachBy: Date | null; liveBy: Date | null };
  // Which stages are done (for ticks on the tracker).
  reached: Record<OnboardingStage, boolean>;
  // Show the activation panel until the workspace is live.
  showPanel: boolean;
}

/** Pure stage computation from the raw activity signals. */
export function computeStage(sig: {
  submittedAt: Date | null;
  leadCount: number;
  draftCount: number;
  sentCount: number;
  activityCount: number; // bookings + genuine replies
}): OnboardingStage {
  if (sig.activityCount > 0) return "LIVE";
  if (sig.sentCount > 0) return "OUTREACH";
  if (sig.draftCount > 0 || (sig.submittedAt && sig.leadCount > 0)) return "BUILDING";
  if (sig.submittedAt) return "BUILDING";
  return "INTAKE";
}

export async function onboardingStatus(orgId: string): Promise<OnboardingStatus> {
  const [org, leadCount, draftCount, sentCount, bookings, cal] = await Promise.all([
    prisma.org.findUnique({ where: { id: orgId }, select: { idealClient: true, onboardingSubmittedAt: true } }),
    prisma.lead.count({ where: { orgId } }),
    prisma.draft.count({ where: { orgId } }),
    prisma.message.count({ where: { orgId, direction: "OUTBOUND", status: "SENT" } }),
    prisma.booking.count({ where: { orgId, status: { in: BOOKED_STATUSES } } }),
    prisma.calendarConnection.findFirst({ where: { orgId, status: "CONNECTED" }, select: { id: true } }),
  ]);

  const submittedAt = org?.onboardingSubmittedAt ?? null;
  const stage = computeStage({ submittedAt, leadCount, draftCount, sentCount, activityCount: bookings });
  const reachedIdx = ORDER.indexOf(stage);

  return {
    stage,
    submitted: Boolean(submittedAt),
    submittedAt,
    idealClient: org?.idealClient ?? null,
    leadCount,
    hasBookingLink: Boolean(cal),
    deadlines: submittedAt
      ? {
          buildBy: new Date(submittedAt.getTime() + SLA.buildHours * HOUR),
          outreachBy: new Date(submittedAt.getTime() + SLA.outreachHours * HOUR),
          liveBy: new Date(submittedAt.getTime() + SLA.activeDays * DAY),
        }
      : { buildBy: null, outreachBy: null, liveBy: null },
    reached: {
      INTAKE: reachedIdx >= 0,
      BUILDING: reachedIdx >= 1,
      OUTREACH: reachedIdx >= 2,
      LIVE: reachedIdx >= 3,
    },
    showPanel: stage !== "LIVE",
  };
}

export interface QuickWin {
  leadId: string;
  name: string;
  company: string | null;
  opener: string;
}

/**
 * The 3 warmest leads to work first, each with a copy-paste opener. "Warmest" =
 * richest signal to book: a real prior inquiry, a reachable address, higher deal
 * value. Openers reference the lead's own words so they're personal, not generic.
 */
export async function pickQuickWins(orgId: string, limit = 3): Promise<QuickWin[]> {
  const leads = await prisma.lead.findMany({
    where: { orgId, status: "NEW", reachability: { not: "INVALID" } },
    orderBy: [{ dealValueCents: "desc" }, { createdAt: "desc" }],
    take: 24,
    select: { id: true, firstName: true, lastName: true, company: true, email: true, originalInquiry: true, statedGoal: true, reachability: true },
  });

  // Rank: a real inquiry first, then a reachable (not risky) address.
  const ranked = leads
    .map((l) => ({ l, score: (l.originalInquiry ? 2 : 0) + (l.reachability === "REACHABLE" ? 1 : 0) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ l }) => l);

  return ranked.map((l) => {
    const first = l.firstName?.trim() || null;
    const name = [l.firstName, l.lastName].filter(Boolean).join(" ").trim() || l.email;
    const topic = (l.originalInquiry || l.statedGoal || "").trim();
    const hi = first ? `Hi ${first}` : "Hi there";
    const opener = topic
      ? `${hi} — a while back you reached out about ${trimTopic(topic)}. I kept your details; if it's still on your mind I'd love to help you pick it back up. Would a quick call this week be useful?`
      : `${hi} — we connected a while back and I wanted to reconnect. If it's still relevant, would a quick call this week be useful?`;
    return { leadId: l.id, name, company: l.company, opener };
  });
}

function trimTopic(topic: string): string {
  const t = topic.replace(/\s+/g, " ").trim();
  return t.length > 90 ? `${t.slice(0, 87)}…` : t;
}
