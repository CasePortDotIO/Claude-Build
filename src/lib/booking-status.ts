import type { BookingStatus } from "@prisma/client";

/**
 * The set of booking statuses that count as "a call was booked" — used by every
 * KPI and the guarantee tracker so the definition lives in ONE place. A booking
 * that was confirmed counts whether it later showed, no-showed, or was moved;
 * only HELD (tentative) and CANCELED don't.
 */
export const BOOKED_STATUSES: BookingStatus[] = ["CONFIRMED", "SHOWED", "NO_SHOW", "RESCHEDULED"];

/**
 * The canonical "qualified booked call" — the ONE definition every guarantee and
 * every billing decision (the result-gated trial conversion, the 3-call and
 * 5-call/month guarantees) measures against. A qualified call is one that was
 * genuinely booked (confirmed), regardless of whether it later showed, no-showed,
 * or moved — a tentative HELD slot does NOT count (it can still evaporate).
 * Identical to BOOKED_STATUSES by design; named separately so the intent is
 * explicit at every money-affecting call site.
 */
export const QUALIFIED_BOOKING_STATUSES: BookingStatus[] = BOOKED_STATUSES;

/** Statuses where the lead actually attended — for show-rate. */
export const SHOWED_STATUSES: BookingStatus[] = ["SHOWED"];

/** Statuses that still occupy a calendar slot (for double-book detection). */
export const ACTIVE_SLOT_STATUSES: BookingStatus[] = ["CONFIRMED", "HELD", "SHOWED"];
