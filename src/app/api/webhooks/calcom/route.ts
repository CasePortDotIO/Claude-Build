import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { bookCall } from "@/lib/agent/booking";

/**
 * Cal.com webhook: detect when a lead books a call directly via the booking
 * link, and capture the slot back into the lead record (§6). We match the
 * attendee email to a lead in any org, dedupe on the booking uid, then run the
 * same bookCall pipeline with source="webhook" (no event is re-created).
 *
 * Note: signature verification (CAL_WEBHOOK_SECRET) should be added before
 * production; the matching is conservative (must hit a known lead) regardless.
 */
export async function POST(req: NextRequest) {
  let payload: CalcomWebhook;
  try {
    payload = (await req.json()) as CalcomWebhook;
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }

  if (payload.triggerEvent !== "BOOKING_CREATED") {
    return NextResponse.json({ ok: true, ignored: payload.triggerEvent });
  }

  const p = payload.payload ?? {};
  const attendeeEmail = p.attendees?.[0]?.email?.toLowerCase();
  const startISO = p.startTime;
  const uid = p.uid;
  if (!attendeeEmail || !startISO) return NextResponse.json({ ok: true, ignored: "missing fields" });

  // Find the matching lead (the booking link is org-scoped via the connection,
  // but the safest match is the attendee's email against a known lead).
  const lead = await prisma.lead.findFirst({ where: { email: attendeeEmail } });
  if (!lead) return NextResponse.json({ ok: true, ignored: "no matching lead" });

  // Dedupe: ignore if we already recorded this provider event.
  if (uid) {
    const existing = await prisma.booking.findFirst({ where: { orgId: lead.orgId, providerEventId: uid } });
    if (existing) return NextResponse.json({ ok: true, deduped: true });
  }
  if (lead.status === "BOOKED") return NextResponse.json({ ok: true, deduped: true });

  await bookCall({
    orgId: lead.orgId,
    leadId: lead.id,
    startsAt: new Date(startISO),
    endsAt: p.endTime ? new Date(p.endTime) : undefined,
    source: "webhook",
    providerEventId: uid,
    meetingUrl: p.metadata?.videoCallUrl ?? null,
  });

  return NextResponse.json({ ok: true });
}

interface CalcomWebhook {
  triggerEvent?: string;
  payload?: {
    uid?: string;
    startTime?: string;
    endTime?: string;
    attendees?: { email?: string; name?: string }[];
    metadata?: { videoCallUrl?: string };
  };
}
