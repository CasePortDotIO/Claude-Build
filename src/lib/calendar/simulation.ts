import { randomUUID } from "node:crypto";
import type { CalendarProvider, CalendarContext, CreateBookingInput, CreatedBooking, AvailabilitySlot } from "@/lib/calendar/types";
import { generateBusinessSlots } from "@/lib/calendar/slots";

/**
 * Offline calendar for dev/demo. Offers real-shaped business-hour slots and
 * "books" by minting an event id — so the full propose → accept → book → BOOKED
 * loop runs with no Cal.com account.
 */
export class SimulationCalendarProvider implements CalendarProvider {
  readonly kind = "SIMULATION" as const;

  async getAvailability(_ctx: CalendarContext, days = 5): Promise<AvailabilitySlot[]> {
    return generateBusinessSlots({ from: new Date(), days });
  }

  async createBooking(_ctx: CalendarContext, input: CreateBookingInput): Promise<CreatedBooking> {
    const id = randomUUID();
    return { providerEventId: `simcal-${id}`, meetingUrl: `https://meet.warmsweep.test/${id.slice(0, 8)}` };
  }
}
