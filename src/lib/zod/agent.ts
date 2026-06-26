import { z } from "zod";

export const learnVoiceSchema = z.object({
  // Either a blob of pasted emails (split on a delimiter) or structured samples.
  samples: z
    .array(z.object({ subject: z.string().trim().max(300).optional(), body: z.string().trim().min(1).max(20000) }))
    .min(1, "Add at least one past email")
    .max(50),
});

export const generateDraftsSchema = z.object({
  leadIds: z.array(z.string().cuid()).min(1).max(200),
  variantCount: z.number().int().min(2).max(3).default(3),
});

export const approveDraftSchema = z.object({
  draftId: z.string().cuid(),
  variantId: z.string().cuid(),
  // Optional human edits at approval time.
  subject: z.string().trim().min(1).max(300).optional(),
  body: z.string().trim().min(1).max(20000).optional(),
});

export const rejectDraftSchema = z.object({
  draftId: z.string().cuid(),
  reason: z.string().trim().max(500).optional(),
});

export const editVoiceProfileSchema = z.object({
  tone: z.string().trim().max(200),
  sentenceLength: z.string().trim().max(200),
  emojiUse: z.string().trim().max(200),
  greeting: z.string().trim().max(200),
  signOff: z.string().trim().max(200),
  signatureMove: z.string().trim().max(200),
  summary: z.string().trim().max(2000).optional(),
});
