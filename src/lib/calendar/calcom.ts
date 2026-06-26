import type {
  CalendarProvider,
  CalendarContext,
  CreateBookingInput,
  CreatedBooking,
  AvailabilitySlot,
} from "@/lib/calendar/types";
import { slotLabel } from "@/lib/calendar/slots";

/**
 * Real Cal.com provider (API v2). Used when a CALCOM CalendarConnection exists
 * with an API key (decrypted by the caller). The plain LINK fallback is handled
 * by LinkCalendarProvider below — no API needed.
 */
const CALCOM_BASE = "https://api.cal.com/v2";

export class CalcomProvider implements CalendarProvider {
  readonly kind = "CALCOM" as const;

  async getAvailability(ctx: CalendarContext, days = 5): Promise<AvailabilitySlot[]> {
    if (!ctx.apiKey || !ctx.eventTypeId) return [];
    const start = new Date();
    const end = new Date(Date.now() + days * 86_400_000);
    const params = new URLSearchParams({
      eventTypeId: ctx.eventTypeId,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      timeZone: ctx.timezone,
    });
    const res = await fetch(`${CALCOM_BASE}/slots?${params.toString()}`, {
      headers: { authorization: `Bearer ${ctx.apiKey}`, "cal-api-version": "2024-09-04" },
    });
    if (!res.ok) return [];
    // Response shape: { data: { "YYYY-MM-DD": [{ start: ISO }] } }
    const json = (await res.json()) as { data?: Record<string, { start: string }[]> };
    const out: AvailabilitySlot[] = [];
    for (const day of Object.values(json.data ?? {})) {
      for (const s of day) {
        const startsAt = new Date(s.start);
        out.push({ startsAt, endsAt: new Date(startsAt.getTime() + 30 * 60_000), label: slotLabel(startsAt) });
      }
    }
    return out.slice(0, 10);
  }

  async createBooking(ctx: CalendarContext, input: CreateBookingInput): Promise<CreatedBooking> {
    if (!ctx.apiKey || !ctx.eventTypeId) throw new Error("Cal.com not fully configured.");
    const res = await fetch(`${CALCOM_BASE}/bookings`, {
      method: "POST",
      headers: { authorization: `Bearer ${ctx.apiKey}`, "content-type": "application/json", "cal-api-version": "2024-08-13" },
      body: JSON.stringify({
        eventTypeId: Number(ctx.eventTypeId),
        start: input.startsAt.toISOString(),
        attendee: { name: input.attendeeName ?? input.attendeeEmail, email: input.attendeeEmail, timeZone: ctx.timezone },
        metadata: { source: "the-warm-sweep" },
      }),
    });
    if (!res.ok) throw new Error(`Cal.com booking failed: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { data?: { uid?: string; meetingUrl?: string } };
    return { providerEventId: json.data?.uid ?? `calcom-${Date.now()}`, meetingUrl: json.data?.meetingUrl };
  }
}

/** Plain booking-link fallback: the lead self-books; we only send the link. */
export class LinkCalendarProvider implements CalendarProvider {
  readonly kind = "LINK" as const;
  async getAvailability(): Promise<AvailabilitySlot[]> {
    return []; // no slots — copy includes the booking link instead
  }
  async createBooking(): Promise<CreatedBooking> {
    throw new Error("LINK calendar does not book directly; the lead books via the link (detected by webhook).");
  }
}
