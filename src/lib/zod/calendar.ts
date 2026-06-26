import { z } from "zod";

export const connectCalcomSchema = z.object({
  apiKey: z.string().trim().min(1, "API key is required").max(400),
  eventTypeId: z.string().trim().min(1, "Event type id is required").max(60),
  timezone: z.string().trim().max(60).default("UTC"),
});

export const setBookingLinkSchema = z.object({
  bookingLink: z.string().trim().url("Enter a valid URL").max(400),
});

export const setSlackWebhookSchema = z.object({
  webhook: z.string().trim().url("Enter a valid Slack webhook URL").max(400),
});

export const simulateBookingSchema = z.object({
  leadId: z.string().cuid(),
  // ISO datetime of the chosen slot.
  startsAt: z.string().datetime(),
});
