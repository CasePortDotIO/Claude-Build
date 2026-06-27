import { describe, it, expect } from "vitest";
import { validateBookingSlot, zonedParts, type BusinessRules } from "@/lib/calendar/validate";

const rules: BusinessRules = {
  timezone: "America/New_York",
  businessStartHour: 9,
  businessEndHour: 17,
  bufferMin: 15,
  allowOutOfHours: false,
};

// A fixed "now" well before the test slots.
const NOW = new Date("2026-06-15T00:00:00Z"); // Monday

// Helpers to build a UTC instant that lands at a given NY wall-clock hour.
// EDT in June = UTC-4, so 14:00Z = 10:00 ET (in hours).
function etSlot(dayISO: string, utcHour: number, durMin = 30) {
  const startsAt = new Date(`${dayISO}T${String(utcHour).padStart(2, "0")}:00:00Z`);
  return { startsAt, endsAt: new Date(startsAt.getTime() + durMin * 60_000) };
}

describe("§6 booking slot validation", () => {
  it("reads wall-clock hour/weekday in the target timezone", () => {
    const p = zonedParts(new Date("2026-06-16T14:00:00Z"), "America/New_York"); // 10:00 ET, Tuesday
    expect(p.hour).toBe(10);
    expect(p.weekday).toBe(2);
  });

  it("accepts an in-hours weekday slot with no conflicts", () => {
    const s = etSlot("2026-06-16", 14); // Tue 10:00 ET
    expect(validateBookingSlot({ ...s, rules, existing: [], now: NOW }).ok).toBe(true);
  });

  it("rejects a slot in the past from any source", () => {
    const s = etSlot("2026-06-16", 14);
    const past = new Date("2026-07-01T00:00:00Z");
    const r = validateBookingSlot({ ...s, rules, existing: [], now: past });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/past/);
  });

  it("rejects an out-of-hours slot (8pm ET) unless allowed", () => {
    const s = etSlot("2026-06-17", 0); // 20:00 ET previous day boundary → 8pm ET Tue? 00:00Z = 20:00 ET Tue
    const r = validateBookingSlot({ ...s, rules, existing: [], now: NOW });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/business hours/);
  });

  it("rejects a weekend slot unless allowed", () => {
    const s = etSlot("2026-06-20", 14); // Saturday 10:00 ET
    const r = validateBookingSlot({ ...s, rules, existing: [], now: NOW });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/weekend/);
  });

  it("allows out-of-hours / weekend when explicitly enabled (but still no past)", () => {
    const s = etSlot("2026-06-20", 14); // Saturday
    const open = { ...rules, allowOutOfHours: true };
    expect(validateBookingSlot({ ...s, rules: open, existing: [], now: NOW }).ok).toBe(true);
  });

  it("rejects a slot that overlaps an existing call's buffer (no double-book)", () => {
    const s = etSlot("2026-06-16", 14); // Tue 10:00 ET, 30 min
    const existing = [etSlot("2026-06-16", 14)]; // same time
    expect(validateBookingSlot({ ...s, rules, existing, now: NOW }).ok).toBe(false);

    // 30 min later still collides because of the 15-min buffer on both sides.
    const tooClose = etSlot("2026-06-16", 14, 30);
    const near = [{ startsAt: new Date("2026-06-16T14:40:00Z"), endsAt: new Date("2026-06-16T15:10:00Z") }];
    expect(validateBookingSlot({ ...tooClose, rules, existing: near, now: NOW }).ok).toBe(false);
  });

  it("allows a non-overlapping later slot the same day", () => {
    const s = etSlot("2026-06-16", 19); // Tue 15:00 ET
    const existing = [etSlot("2026-06-16", 14)]; // Tue 10:00 ET
    expect(validateBookingSlot({ ...s, rules, existing, now: NOW }).ok).toBe(true);
  });
});
