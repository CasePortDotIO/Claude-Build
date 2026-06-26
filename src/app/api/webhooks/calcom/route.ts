import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { bookCall, BookingError } from "@/lib/agent/booking";
import { verifyWebhookToken } from "@/lib/webhook-token";

/**
 * Cal.com webhook: detect when a lead books a call directly via the booking
 * link, and capture the slot (§6).
 *
 * Security (hardened in QA):
 *  - The URL carries a per-ORG signed token (?t=) so the receiving org is
 *    identified cryptographically; the lead lookup is scoped to THAT org only.
 *    Without this, a bare email match leaked bookings across tenants.
 *  - If CAL_WEBHOOK_SECRET is set, the raw body's HMAC signature
 *    (x-cal-signature-256) is verified before anything is trusted.
 */
export async function POST(req: NextRequest) {
  // 1. Org-scoping token (mandatory — no token, no booking).
  const orgId = verifyWebhookToken(req.nextUrl.searchParams.get("t"));
  if (!orgId) return NextResponse.json({ ok: false, error: "missing or invalid org token" }, { status: 401 });

  // 2. Optional signature verification over the raw body.
  const raw = await req.text();
  const secret = process.env.CAL_WEBHOOK_SECRET;
  if (secret) {
    const provided = req.headers.get("x-cal-signature-256") ?? "";
    const expected = createHmac("sha256", secret).update(raw).digest("hex");
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return NextResponse.json({ ok: false, error: "bad signature" }, { status: 401 });
    }
  }

  let payload: CalcomWebhook;
  try {
    payload = JSON.parse(raw) as CalcomWebhook;
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

  // 3. Lead lookup is scoped to the token's org — never a cross-tenant match.
  const lead = await prisma.lead.findFirst({ where: { orgId, email: attendeeEmail } });
  if (!lead) return NextResponse.json({ ok: true, ignored: "no matching lead in org" });

  // Dedupe on the provider event + already-booked.
  if (uid) {
    const existing = await prisma.booking.findFirst({ where: { orgId, providerEventId: uid } });
    if (existing) return NextResponse.json({ ok: true, deduped: true });
  }
  if (lead.status === "BOOKED") return NextResponse.json({ ok: true, deduped: true });

  try {
    await bookCall({
      orgId,
      leadId: lead.id,
      startsAt: new Date(startISO),
      endsAt: p.endTime ? new Date(p.endTime) : undefined,
      source: "webhook",
      providerEventId: uid,
      meetingUrl: p.metadata?.videoCallUrl ?? null,
    });
  } catch (e) {
    // A booking blocked by compliance (e.g. opted-out) is not an error to retry.
    if (e instanceof BookingError) return NextResponse.json({ ok: true, ignored: e.message });
    throw e;
  }

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
