import type {
  CalendarProvider,
  CalendarContext,
  CreateBookingInput,
  CreatedBooking,
  AvailabilitySlot,
} from "@/lib/calendar/types";
import { slotLabel } from "@/lib/calendar/slots";

/**
 * Calendly provider. Calendly is scheduling-link-first: availability comes from
 * an event type, and the invitee books via the link (we detect it by webhook).
 * We surface available times via the API for the agent to offer in copy; direct
 * server-side booking is link-based, so createBooking returns the booking link.
 */
const CALENDLY = "https://api.calendly.com";

export class CalendlyProvider implements CalendarProvider {
  readonly kind = "CALENDLY" as const;

  async getAvailability(ctx: CalendarContext, days = 5): Promise<AvailabilitySlot[]> {
    const eventType = ctx.eventTypeId; // a Calendly event type URI
    if (!ctx.apiKey || !eventType) return [];
    const start = new Date();
    const end = new Date(Date.now() + days * 86_400_000);
    const params = new URLSearchParams({
      event_type: eventType,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
    });
    const res = await fetch(`${CALENDLY}/event_type_available_times?${params.toString()}`, {
      headers: { authorization: `Bearer ${ctx.apiKey}` },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { collection?: { start_time: string }[] };
    return (json.collection ?? []).slice(0, 10).map((s) => {
      const startsAt = new Date(s.start_time);
      return { startsAt, endsAt: new Date(startsAt.getTime() + 30 * 60_000), label: slotLabel(startsAt) };
    });
  }

  async createBooking(ctx: CalendarContext, _input: CreateBookingInput): Promise<CreatedBooking> {
    // Calendly invitees self-book via the scheduling link; the BOOKING_CREATED
    // webhook captures the confirmed slot. We return the link as the "meeting".
    return { providerEventId: `calendly-pending-${Date.now()}`, meetingUrl: ctx.bookingLink ?? undefined };
  }
}
