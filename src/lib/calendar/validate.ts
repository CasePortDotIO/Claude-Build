// §6 booking quality: validate a requested slot before it becomes a booking.
// Reviewers across the category report AI setters booking off-hours, in the wrong
// timezone, and double-booking — every one of those is a junk "booked call" that
// triggers a refund. This is the gate that makes a booking mean a real, attendable
// meeting.

export interface BusinessRules {
  timezone: string;
  businessStartHour: number;
  businessEndHour: number; // exclusive on the start time
  bufferMin: number;
  allowOutOfHours: boolean;
}

export interface ExistingBooking {
  startsAt: Date;
  endsAt: Date;
}

export interface SlotValidation {
  ok: boolean;
  reason?: string;
}

/** Hour/minute/weekday of a UTC instant *as seen in* a given IANA timezone. */
export function zonedParts(date: Date, timezone: string): { hour: number; minute: number; weekday: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const hour = parseInt(get("hour"), 10) % 24; // "24" → 0 at midnight
  const minute = parseInt(get("minute"), 10);
  const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { hour, minute, weekday: WD[get("weekday")] ?? 0 };
}

/**
 * Validate a proposed slot against business rules + existing bookings.
 * `enforceHours` is false for self-booked (webhook/link) slots — the external
 * provider already enforced its own availability there — but the no-double-book
 * and not-in-the-past checks ALWAYS apply, from every source.
 */
export function validateBookingSlot(opts: {
  startsAt: Date;
  endsAt: Date;
  rules: BusinessRules;
  existing: ExistingBooking[];
  now?: Date;
  enforceHours?: boolean;
}): SlotValidation {
  const { startsAt, endsAt, rules, existing } = opts;
  const now = opts.now ?? new Date();
  const enforceHours = opts.enforceHours ?? true;

  if (endsAt <= startsAt) return { ok: false, reason: "end time must be after the start time" };
  if (startsAt <= now) return { ok: false, reason: "that time is in the past" };

  if (enforceHours && !rules.allowOutOfHours) {
    const { hour, weekday } = zonedParts(startsAt, rules.timezone);
    if (weekday === 0 || weekday === 6) {
      return { ok: false, reason: "weekend bookings are off unless explicitly enabled" };
    }
    if (hour < rules.businessStartHour || hour >= rules.businessEndHour) {
      return { ok: false, reason: `outside business hours (${rules.businessStartHour}:00–${rules.businessEndHour}:00 ${rules.timezone})` };
    }
  }

  // No double-booking: the slot, padded by the buffer on both sides, must not
  // overlap any existing booking. Buffer protects back-to-back calls.
  const bufferMs = Math.max(0, rules.bufferMin) * 60_000;
  const lo = startsAt.getTime() - bufferMs;
  const hi = endsAt.getTime() + bufferMs;
  for (const b of existing) {
    if (b.startsAt.getTime() < hi && b.endsAt.getTime() > lo) {
      return { ok: false, reason: "overlaps an existing call (or its buffer)" };
    }
  }

  return { ok: true };
}
