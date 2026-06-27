import { prisma } from "@/lib/prisma";
import type { OutcomeKind } from "@prisma/client";

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
  at?: Date;
}): Promise<void> {
  try {
    const org = await prisma.org.findUnique({ where: { id: opts.orgId }, select: { vertical: true } });
    const at = opts.at ?? new Date();
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
