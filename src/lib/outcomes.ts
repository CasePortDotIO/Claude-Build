import { prisma } from "@/lib/prisma";
import { experimentArm } from "@/lib/agent/experiments";
import { assignCohort } from "@/lib/agent/rollups";
import type { OutcomeKind } from "@prisma/client";

const DAY_MS = 86_400_000;

/**
 * §10 outcome-data capture. The tool is cloneable; proprietary data on what
 * actually converts cold leads is not. This append-only log records each
 * meaningful event with the dimensions that later feed cadence/subject
 * optimization and per-vertical defaults.
 *
 * PRIVACY: this is for AGGREGATE pattern-learning only. Every row is org-scoped;
 * no customer-facing surface ever reads another org's rows, and nothing here
 * moves a contact from one org to another.
 *
 * Best-effort: a logging failure must never break a send, reply, or booking.
 */
export async function recordOutcome(opts: {
  orgId: string;
  kind: OutcomeKind;
  leadId?: string | null;
  subject?: string | null;
  variantAngle?: string | null;
  sendHour?: number | null;
  valueCents?: number;
  // Corpus vector — derived from the lead when not passed, so EVERY terminal
  // event (SENT / REPLIED / BOOKED / OPTED_OUT) records a complete, causal row.
  touch?: number | null;
  source?: string | null;
  at?: Date;
}): Promise<void> {
  try {
    const org = await prisma.org.findUnique({ where: { id: opts.orgId }, select: { vertical: true } });
    const at = opts.at ?? new Date();

    // Complete the vector from the lead: cadence step, list source, the causal
    // control flag + the arm (control leads carry "control", not an experiment
    // arm), reachability (frozen — it drifts), and coldness at the time worked.
    // Best-effort — telemetry, never truth.
    let touch = opts.touch;
    let source = opts.source;
    let arm: string | null = null;
    let isHoldout: boolean | null = null;
    let reachability: string | null = null;
    let leadColdnessDays: number | null = null;
    if (opts.leadId) {
      const lead = await prisma.lead.findUnique({
        where: { id: opts.leadId },
        select: { source: true, reachability: true, lastEngagedAt: true },
      });
      if (source === undefined) source = lead?.source ?? null;
      if (touch === undefined) {
        touch = await prisma.message.count({ where: { orgId: opts.orgId, leadId: opts.leadId, direction: "OUTBOUND" } });
      }
      isHoldout = assignCohort(opts.orgId, opts.leadId) === "HOLDOUT";
      arm = isHoldout ? "control" : experimentArm(opts.leadId);
      reachability = lead?.reachability ?? null;
      if (lead?.lastEngagedAt) {
        leadColdnessDays = Math.max(0, Math.floor((at.getTime() - lead.lastEngagedAt.getTime()) / DAY_MS));
      }
    }

    await prisma.outcomeEvent.create({
      data: {
        orgId: opts.orgId,
        leadId: opts.leadId ?? null,
        kind: opts.kind,
        subject: opts.subject ?? null,
        variantAngle: opts.variantAngle ?? null,
        sendHour: opts.sendHour ?? at.getHours(),
        vertical: org?.vertical ?? null,
        valueCents: opts.valueCents ?? 0,
        touch: touch ?? null,
        source: source ?? null,
        arm,
        isHoldout,
        reachability,
        leadColdnessDays,
      },
    });
  } catch {
    // swallow — telemetry must never break the loop
  }
}

export interface OutcomeAggregate {
  dimension: string; // the grouped value (angle, hour, or vertical)
  sent: number;
  replied: number;
  booked: number;
  replyRate: number; // replied / sent
  bookRate: number; // booked / sent
}

/**
 * Internal aggregate for learning — group outcomes by a chosen dimension. NOT a
 * customer-facing read: callers (the reflection engine, ops) pass `orgId` to scope
 * to one workspace, or omit it for cross-org defaults that are surfaced only as
 * anonymized patterns, never raw rows.
 */
export async function outcomeAggregates(by: "variantAngle" | "sendHour" | "vertical", orgId?: string): Promise<OutcomeAggregate[]> {
  const where = orgId ? { orgId } : {};
  const rows = await prisma.outcomeEvent.groupBy({
    by: [by, "kind"],
    where,
    _count: { _all: true },
  });

  const acc = new Map<string, { sent: number; replied: number; booked: number }>();
  for (const r of rows) {
    const key = String(r[by] ?? "—");
    const cur = acc.get(key) ?? { sent: 0, replied: 0, booked: 0 };
    const n = r._count._all;
    if (r.kind === "SENT") cur.sent += n;
    else if (r.kind === "REPLIED") cur.replied += n;
    else if (r.kind === "BOOKED") cur.booked += n;
    acc.set(key, cur);
  }

  return [...acc.entries()]
    .map(([dimension, v]) => ({
      dimension,
      ...v,
      replyRate: v.sent ? v.replied / v.sent : 0,
      bookRate: v.sent ? v.booked / v.sent : 0,
    }))
    .sort((a, b) => b.sent - a.sent);
}
