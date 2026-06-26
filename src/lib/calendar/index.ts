import type { CalendarConnection } from "@prisma/client";
import type { CalendarContext, CalendarProvider } from "@/lib/calendar/types";
import { CalcomProvider, LinkCalendarProvider } from "@/lib/calendar/calcom";
import { SimulationCalendarProvider } from "@/lib/calendar/simulation";
import { decryptSecret } from "@/lib/crypto";

export * from "@/lib/calendar/types";

export function getCalendarProvider(kind: "CALCOM" | "CALENDLY" | "SIMULATION" | "LINK"): CalendarProvider {
  switch (kind) {
    case "CALCOM":
      return new CalcomProvider();
    case "SIMULATION":
      return new SimulationCalendarProvider();
    case "LINK":
      return new LinkCalendarProvider();
    case "CALENDLY":
      throw new Error("Calendly lands in M7.");
  }
}

export function calendarContext(conn: CalendarConnection): CalendarContext {
  return {
    apiKey: conn.apiKeyEnc ? decryptSecret(conn.apiKeyEnc) : undefined,
    eventTypeId: conn.eventTypeId,
    bookingLink: conn.bookingLink,
    timezone: conn.timezone,
  };
}
