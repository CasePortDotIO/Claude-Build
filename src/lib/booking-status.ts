import type { BookingStatus } from "@prisma/client";

/**
 * The set of booking statuses that count as "a call was booked" — used by every
 * KPI and the guarantee tracker so the definition lives in ONE place. A booking
 * that was confirmed counts whether it later showed, no-showed, or was moved;
 * only HELD (tentative) and CANCELED don't.
 */
export const BOOKED_STATUSES: BookingStatus[] = ["CONFIRMED", "SHOWED", "NO_SHOW", "RESCHEDULED"];

/** Statuses where the lead actually attended — for show-rate. */
export const SHOWED_STATUSES: BookingStatus[] = ["SHOWED"];

/** Statuses that still occupy a calendar slot (for double-book detection). */
export const ACTIVE_SLOT_STATUSES: BookingStatus[] = ["CONFIRMED", "HELD", "SHOWED"];
