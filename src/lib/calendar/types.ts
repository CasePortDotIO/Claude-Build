// The CalendarProvider adapter interface (§6). Cal.com ships first; Calendly is
// stubbed behind the same interface for M7. A plain booking-link fallback needs
// no provider — the agent just sends the link and a webhook reports the booking.

export interface AvailabilitySlot {
  startsAt: Date;
  endsAt: Date;
  label: string; // human label, e.g. "Tue 9:00 AM"
}

export interface CreateBookingInput {
  startsAt: Date;
  endsAt: Date;
  attendeeEmail: string;
  attendeeName?: string | null;
  notes?: string;
}

export interface CreatedBooking {
  providerEventId: string;
  meetingUrl?: string;
}

export interface CalendarContext {
  apiKey?: string;
  eventTypeId?: string | null;
  bookingLink?: string | null;
  timezone: string;
}

export interface CalendarProvider {
  readonly kind: "CALCOM" | "CALENDLY" | "SIMULATION" | "LINK";
  /** Real, bookable slots to offer in copy. */
  getAvailability(ctx: CalendarContext, days?: number): Promise<AvailabilitySlot[]>;
  /** Create the actual event. LINK providers throw (the lead self-books). */
  createBooking(ctx: CalendarContext, input: CreateBookingInput): Promise<CreatedBooking>;
}
