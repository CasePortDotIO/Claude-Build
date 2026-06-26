import type { AvailabilitySlot } from "@/lib/calendar/types";

// Format a slot label like "Tue 9:00 AM". Used for offering times in copy.
export function slotLabel(d: Date): string {
  return d.toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", hour12: true });
}

/**
 * Deterministic-shaped availability generator: the next `days` business days at
 * the given hours, skipping any slot already in the past. Shared by the
 * simulation provider and used as a sensible default when a real provider
 * returns nothing. `from` is injectable so tests are reproducible.
 */
export function generateBusinessSlots(opts: {
  from: Date;
  days?: number;
  hours?: number[];
  durationMin?: number;
}): AvailabilitySlot[] {
  const { from, days = 5, hours = [9, 14], durationMin = 30 } = opts;
  const slots: AvailabilitySlot[] = [];
  const cursor = new Date(from);
  cursor.setMinutes(0, 0, 0);

  let dayCount = 0;
  const day = new Date(cursor);
  while (dayCount < days) {
    day.setDate(day.getDate() + 1); // start from tomorrow
    const dow = day.getDay();
    if (dow === 0 || dow === 6) continue; // skip weekends
    dayCount += 1;
    for (const h of hours) {
      const startsAt = new Date(day);
      startsAt.setHours(h, 0, 0, 0);
      if (startsAt <= from) continue;
      const endsAt = new Date(startsAt.getTime() + durationMin * 60_000);
      slots.push({ startsAt, endsAt, label: slotLabel(startsAt) });
    }
  }
  return slots;
}
