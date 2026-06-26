import { describe, it, expect } from "vitest";
import { generateBusinessSlots, slotLabel } from "@/lib/calendar/slots";

describe("availability slot generation", () => {
  it("produces future weekday slots at the configured hours", () => {
    const from = new Date("2026-01-05T08:00:00Z"); // a Monday morning
    const slots = generateBusinessSlots({ from, days: 5, hours: [9, 14] });
    expect(slots.length).toBe(10); // 5 weekdays × 2 hours

    // All slots are in the future and on weekdays.
    for (const s of slots) {
      expect(s.startsAt.getTime()).toBeGreaterThan(from.getTime());
      const dow = s.startsAt.getDay();
      expect(dow).not.toBe(0);
      expect(dow).not.toBe(6);
      expect(s.endsAt.getTime()).toBeGreaterThan(s.startsAt.getTime());
    }
  });

  it("skips weekends", () => {
    const from = new Date("2026-01-09T08:00:00Z"); // a Friday
    const slots = generateBusinessSlots({ from, days: 3, hours: [10] });
    // next 3 weekdays after Fri = Mon, Tue, Wed
    const days = slots.map((s) => s.startsAt.getDay());
    expect(days).not.toContain(0);
    expect(days).not.toContain(6);
    expect(slots.length).toBe(3);
  });

  it("formats a readable label", () => {
    expect(slotLabel(new Date("2026-01-06T09:00:00"))).toMatch(/9:00|9 AM|AM/i);
  });
});
