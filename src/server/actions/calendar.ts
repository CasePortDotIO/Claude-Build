"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOrg } from "@/lib/auth-helpers";
import { encryptSecret } from "@/lib/crypto";
import { bookCall, BookingError, availabilityLabels, activeCalendar } from "@/lib/agent/booking";
import { getCalendarProvider, calendarContext } from "@/lib/calendar";
import { connectCalcomSchema, setBookingLinkSchema, setSlackWebhookSchema, simulateBookingSchema } from "@/lib/zod/calendar";

export interface CalendarActionResult {
  ok: boolean;
  error?: string;
  message?: string;
  slots?: { startsAt: string; label: string }[];
}

/** Connect an offline simulated calendar so the booking loop runs without Cal.com. */
export async function connectSimulationCalendarAction(): Promise<CalendarActionResult> {
  const ctx = await requireOrg();
  const existing = await prisma.calendarConnection.findFirst({ where: { orgId: ctx.orgId, provider: "SIMULATION" } });
  if (existing) {
    await prisma.calendarConnection.update({ where: { id: existing.id }, data: { status: "CONNECTED" } });
  } else {
    await prisma.calendarConnection.create({
      data: { orgId: ctx.orgId, provider: "SIMULATION", status: "CONNECTED", timezone: "UTC", bookingLink: "https://cal.com/demo/intro" },
    });
  }
  revalidatePath("/connections");
  return { ok: true, message: "Connected simulated calendar." };
}

export async function connectCalcomAction(raw: unknown): Promise<CalendarActionResult> {
  const ctx = await requireOrg();
  const parsed = connectCalcomSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { apiKey, eventTypeId, timezone } = parsed.data;

  await prisma.calendarConnection.create({
    data: { orgId: ctx.orgId, provider: "CALCOM", status: "CONNECTED", apiKeyEnc: encryptSecret(apiKey), eventTypeId, timezone },
  });
  revalidatePath("/connections");
  return { ok: true, message: "Connected Cal.com." };
}

export async function setBookingLinkAction(raw: unknown): Promise<CalendarActionResult> {
  const ctx = await requireOrg();
  const parsed = setBookingLinkSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const existing = await prisma.calendarConnection.findFirst({ where: { orgId: ctx.orgId } });
  if (existing) {
    await prisma.calendarConnection.update({ where: { id: existing.id }, data: { bookingLink: parsed.data.bookingLink } });
  } else {
    await prisma.calendarConnection.create({
      data: { orgId: ctx.orgId, provider: "LINK", status: "CONNECTED", bookingLink: parsed.data.bookingLink },
    });
  }
  revalidatePath("/connections");
  return { ok: true, message: "Booking link saved." };
}

export async function setSlackWebhookAction(raw: unknown): Promise<CalendarActionResult> {
  const ctx = await requireOrg();
  const parsed = setSlackWebhookSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  await prisma.org.update({ where: { id: ctx.orgId }, data: { slackWebhookEnc: encryptSecret(parsed.data.webhook) } });
  revalidatePath("/connections");
  return { ok: true, message: "Slack notifications enabled." };
}

/** Fetch offerable slots for the simulate-booking UI. */
export async function getAvailabilityAction(): Promise<CalendarActionResult> {
  const ctx = await requireOrg();
  const cal = await activeCalendar(ctx.orgId);
  if (!cal) return { ok: false, error: "No calendar connected." };
  const slots = await getCalendarProvider(cal.provider).getAvailability(calendarContext(cal));
  return { ok: true, slots: slots.slice(0, 6).map((s) => ({ startsAt: s.startsAt.toISOString(), label: s.label })) };
}

/** Book a call for a lead at a chosen slot (the agent/operator confirming a time). */
export async function bookCallAction(raw: unknown): Promise<CalendarActionResult> {
  const ctx = await requireOrg();
  const parsed = simulateBookingSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  try {
    await bookCall({ orgId: ctx.orgId, leadId: parsed.data.leadId, startsAt: new Date(parsed.data.startsAt), source: "agent" });
  } catch (e) {
    if (e instanceof BookingError) return { ok: false, error: e.message };
    throw e;
  }
  revalidatePath("/conversations");
  revalidatePath("/leads");
  revalidatePath("/");
  return { ok: true, message: "Call booked to your calendar." };
}

// Helper for the Conversations "book" control: surface labels for the lead.
export async function leadAvailabilityAction(): Promise<string[]> {
  const ctx = await requireOrg();
  return availabilityLabels(ctx.orgId, 6);
}
