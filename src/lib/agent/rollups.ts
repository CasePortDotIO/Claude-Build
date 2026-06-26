import { prisma } from "@/lib/prisma";
import { createHash } from "node:crypto";

/**
 * Outcome rollups for self-improvement (§8). All derived from real data:
 * outbound messages (what was sent, when, with which opener) joined to whether
 * that lead later replied / booked. No opens (no tracking pixel) — we measure
 * replies and bookings, which are the outcomes that matter.
 */

export interface OpenerStat {
  opener: string;
  sent: number;
  replied: number;
  booked: number;
  replyRate: number;
}

export interface HourStat {
  hour: number; // 0–23
  sent: number;
  replied: number;
  replyRate: number;
}

export interface CohortStat {
  cohort: "TREATMENT" | "HOLDOUT";
  contacted: number;
  replied: number;
  booked: number;
  replyRate: number;
  bookRate: number;
}

interface SentRow {
  leadId: string;
  opener: string;
  hour: number;
  cohort: "TREATMENT" | "HOLDOUT";
  replied: boolean;
  booked: boolean;
}

// One row per first outbound message per lead, tagged with outcome.
async function sentRows(orgId: string): Promise<SentRow[]> {
  const messages = await prisma.message.findMany({
    where: { orgId, direction: "OUTBOUND" },
    orderBy: { createdAt: "asc" },
    include: {
      lead: { select: { id: true, status: true, cohort: true } },
      draft: { include: { variants: true } },
    },
  });

  // Which leads ever sent a genuine reply.
  const repliedLeadIds = new Set(
    (
      await prisma.message.findMany({
        where: { orgId, direction: "INBOUND", isAutoReply: false, isBounce: false },
        distinct: ["leadId"],
        select: { leadId: true },
      })
    ).map((m) => m.leadId),
  );

  const seen = new Set<string>();
  const rows: SentRow[] = [];
  for (const m of messages) {
    if (seen.has(m.leadId)) continue; // first send per lead only
    seen.add(m.leadId);
    const variant = m.draft?.variants.find((v) => v.id === m.draft?.selectedVariantId) ?? m.draft?.variants[0];
    const opener = (variant?.openingLine ?? m.body.split("\n").find((l) => l.trim()) ?? "").trim();
    rows.push({
      leadId: m.leadId,
      opener: normalizeOpener(opener),
      hour: new Date(m.sentAt ?? m.createdAt).getHours(),
      cohort: m.lead.cohort,
      replied: repliedLeadIds.has(m.leadId),
      booked: m.lead.status === "BOOKED",
    });
  }
  return rows;
}

// Collapse openers to a comparable key (first ~8 words, lowercased).
export function normalizeOpener(opener: string): string {
  return opener.toLowerCase().replace(/\s+/g, " ").trim().split(" ").slice(0, 8).join(" ");
}

export async function openerStats(orgId: string): Promise<OpenerStat[]> {
  const rows = await sentRows(orgId);
  const map = new Map<string, OpenerStat>();
  for (const r of rows) {
    if (!r.opener) continue;
    const s = map.get(r.opener) ?? { opener: r.opener, sent: 0, replied: 0, booked: 0, replyRate: 0 };
    s.sent += 1;
    if (r.replied) s.replied += 1;
    if (r.booked) s.booked += 1;
    map.set(r.opener, s);
  }
  return [...map.values()]
    .map((s) => ({ ...s, replyRate: s.sent ? s.replied / s.sent : 0 }))
    .sort((a, b) => b.replyRate - a.replyRate);
}

export async function hourStats(orgId: string): Promise<HourStat[]> {
  const rows = await sentRows(orgId);
  const map = new Map<number, HourStat>();
  for (const r of rows) {
    const s = map.get(r.hour) ?? { hour: r.hour, sent: 0, replied: 0, replyRate: 0 };
    s.sent += 1;
    if (r.replied) s.replied += 1;
    map.set(r.hour, s);
  }
  return [...map.values()].map((s) => ({ ...s, replyRate: s.sent ? s.replied / s.sent : 0 })).sort((a, b) => a.hour - b.hour);
}

export async function cohortStats(orgId: string): Promise<CohortStat[]> {
  const rows = await sentRows(orgId);
  const out: CohortStat[] = (["TREATMENT", "HOLDOUT"] as const).map((cohort) => {
    const c = rows.filter((r) => r.cohort === cohort);
    const replied = c.filter((r) => r.replied).length;
    const booked = c.filter((r) => r.booked).length;
    return {
      cohort,
      contacted: c.length,
      replied,
      booked,
      replyRate: c.length ? replied / c.length : 0,
      bookRate: c.length ? booked / c.length : 0,
    };
  });
  return out;
}

// A/B lift = (treatment reply rate − holdout reply rate) / holdout reply rate.
export function abLift(stats: CohortStat[]): { liftPct: number | null; treatment?: CohortStat; holdout?: CohortStat } {
  const treatment = stats.find((s) => s.cohort === "TREATMENT");
  const holdout = stats.find((s) => s.cohort === "HOLDOUT");
  if (!treatment || !holdout || holdout.contacted === 0 || holdout.replyRate === 0) {
    return { liftPct: null, treatment, holdout };
  }
  return { liftPct: ((treatment.replyRate - holdout.replyRate) / holdout.replyRate) * 100, treatment, holdout };
}

/**
 * Deterministic A/B cohort assignment (§8): ~15% of leads are HOLDOUT (control).
 * Stable per (orgId, leadId) so a lead never flips cohort between runs.
 */
export function assignCohort(orgId: string, leadId: string, holdoutPct = 15): "TREATMENT" | "HOLDOUT" {
  const h = createHash("sha256").update(`${orgId}:${leadId}`).digest();
  const bucket = h.readUInt16BE(0) % 100;
  return bucket < holdoutPct ? "HOLDOUT" : "TREATMENT";
}
