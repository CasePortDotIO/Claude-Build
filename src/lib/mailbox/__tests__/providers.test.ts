import { describe, it, expect } from "vitest";
import { MicrosoftGraphProvider } from "@/lib/mailbox/microsoft";
import { classifyInbound } from "@/lib/mailbox/types";
import { CalendlyProvider } from "@/lib/calendar/calendly";
import { getMailboxProvider } from "@/lib/mailbox";
import { getCalendarProvider } from "@/lib/calendar";

describe("M7 provider wiring", () => {
  it("routes MICROSOFT + CALENDLY through the factories", () => {
    expect(getMailboxProvider("MICROSOFT").kind).toBe("MICROSOFT");
    expect(getCalendarProvider("CALENDLY").kind).toBe("CALENDLY");
  });

  it("builds a Microsoft OAuth authorize URL with the right scopes", async () => {
    process.env.MICROSOFT_CLIENT_ID = "test-client";
    const url = await new MicrosoftGraphProvider().getAuthUrl("state123");
    expect(url).toContain("login.microsoftonline.com");
    expect(url).toContain("Mail.Send");
    expect(decodeURIComponent(url)).toContain("state123");
  });

  it("Calendly returns no slots without an API key/event type", async () => {
    const slots = await new CalendlyProvider().getAvailability({ timezone: "UTC" });
    expect(slots).toEqual([]);
  });

  it("inbound classifier still flags Outlook-style bounces", () => {
    expect(classifyInbound({ fromEmail: "postmaster@x", subject: "Undeliverable", body: "550 5.1.1" }).isBounce).toBe(true);
  });
});
