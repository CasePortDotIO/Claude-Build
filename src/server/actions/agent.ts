"use server";

import { revalidatePath } from "next/cache";
import { prisma, withDbRetry } from "@/lib/prisma";
import { requireOrg } from "@/lib/auth-helpers";
import { learnVoice } from "@/lib/agent/voice";
import { generateDraftsForLead, DraftGuardError } from "@/lib/agent/draft";
import {
  learnVoiceSchema,
  generateDraftsSchema,
  approveDraftSchema,
  rejectDraftSchema,
  editVoiceProfileSchema,
} from "@/lib/zod/agent";

export interface AgentActionResult {
  ok: boolean;
  error?: string;
  message?: string;
  generated?: number;
  skipped?: { leadId: string; reason: string }[];
}

async function operatorName(orgId: string): Promise<string> {
  const org = await prisma.org.findUnique({ where: { id: orgId }, select: { name: true, brandName: true } });
  return org?.brandName || org?.name || "the team";
}

// ── Voice ────────────────────────────────────────────────────────────────────
export async function learnVoiceAction(raw: unknown): Promise<AgentActionResult> {
  const ctx = await requireOrg();
  const parsed = learnVoiceSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  await learnVoice({
    orgId: ctx.orgId,
    operatorName: await operatorName(ctx.orgId),
    samples: parsed.data.samples,
  });
  revalidatePath("/agent");
  return { ok: true, message: `Voice profile learned from ${parsed.data.samples.length} emails.` };
}

export async function editVoiceProfileAction(raw: unknown): Promise<AgentActionResult> {
  const ctx = await requireOrg();
  const parsed = editVoiceProfileSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;

  await prisma.voiceProfile.upsert({
    where: { orgId: ctx.orgId },
    create: { orgId: ctx.orgId, ...d, source: "edited" },
    update: { ...d, source: "edited" },
  });
  revalidatePath("/agent");
  return { ok: true, message: "Voice profile updated." };
}

// ── Drafting ───────────────────────────────────────────────────────────────
export async function generateDraftsAction(raw: unknown): Promise<AgentActionResult> {
  const ctx = await requireOrg();
  const parsed = generateDraftsSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const op = await operatorName(ctx.orgId);
  let generated = 0;
  const skipped: { leadId: string; reason: string }[] = [];
  let hadUnexpectedError = false;

  for (const leadId of parsed.data.leadIds) {
    try {
      // Retry transient DB connection drops (stale Neon connection after idle).
      await withDbRetry(() =>
        generateDraftsForLead({ orgId: ctx.orgId, leadId, operatorName: op, variantCount: parsed.data.variantCount }),
      );
      generated += 1;
    } catch (e) {
      if (e instanceof DraftGuardError) {
        skipped.push({ leadId, reason: e.message });
      } else {
        hadUnexpectedError = true;
        skipped.push({ leadId, reason: e instanceof Error ? e.message : "Unknown error" });
      }
    }
  }

  revalidatePath("/approvals");
  revalidatePath("/leads");
  revalidatePath("/");

  // Don't disguise a backend failure as success: if nothing was drafted and the
  // skips were unexpected errors (not eligibility guards), report it so the
  // button surfaces the problem instead of silently doing nothing.
  if (generated === 0 && hadUnexpectedError) {
    return { ok: false, generated, skipped, error: `Couldn't generate drafts: ${skipped[0]?.reason ?? "server error"}` };
  }
  return { ok: true, generated, skipped, message: `Drafted ${generated} lead(s); skipped ${skipped.length}.` };
}

// ── Approval queue ───────────────────────────────────────────────────────────
export async function approveDraftAction(raw: unknown): Promise<AgentActionResult> {
  const ctx = await requireOrg();
  const parsed = approveDraftSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { draftId, variantId, subject, body } = parsed.data;

  // Scope by orgId; load the chosen variant for final copy.
  const draft = await prisma.draft.findFirst({
    where: { id: draftId, orgId: ctx.orgId },
    include: { variants: true },
  });
  if (!draft) return { ok: false, error: "Draft not found." };
  if (draft.status !== "PENDING_APPROVAL") return { ok: false, error: `Draft is already ${draft.status}.` };
  const variant = draft.variants.find((v) => v.id === variantId);
  if (!variant) return { ok: false, error: "Selected variant not found on this draft." };

  const finalSubject = subject ?? variant.subject;
  const finalBody = body ?? variant.body;
  const edited = finalSubject !== variant.subject || finalBody !== variant.body;

  await prisma.$transaction([
    prisma.draft.update({
      where: { id: draft.id },
      data: {
        status: "APPROVED",
        selectedVariantId: variantId,
        finalSubject,
        finalBody,
        editedByHuman: edited,
        approvedById: ctx.userId,
        approvedAt: new Date(),
      },
    }),
    // Approved but not sent — sending lands in M3. Lead is queued to send.
    prisma.lead.update({ where: { id: draft.leadId }, data: { status: "SCHEDULED", lastTouchAt: new Date() } }),
    prisma.auditLog.create({
      data: {
        orgId: ctx.orgId,
        actorId: ctx.userId,
        action: "draft.approve",
        targetType: "Draft",
        targetId: draft.id,
        metadata: { variantId, edited },
      },
    }),
  ]);

  revalidatePath("/approvals");
  revalidatePath("/leads");
  return { ok: true, message: edited ? "Approved with your edits — queued to send (M3)." : "Approved — queued to send (M3)." };
}

export async function rejectDraftAction(raw: unknown): Promise<AgentActionResult> {
  const ctx = await requireOrg();
  const parsed = rejectDraftSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const draft = await prisma.draft.findFirst({ where: { id: parsed.data.draftId, orgId: ctx.orgId } });
  if (!draft) return { ok: false, error: "Draft not found." };

  await prisma.$transaction([
    prisma.draft.update({
      where: { id: draft.id },
      data: { status: "REJECTED", rejectedReason: parsed.data.reason },
    }),
    // Send the lead back to RESEARCHED so it can be re-drafted.
    prisma.lead.update({ where: { id: draft.leadId }, data: { status: "RESEARCHED" } }),
    // Audit the review either way — rejecting is engagement too, and keeps the
    // streak honest: reviewing counts, not specifically saying yes.
    prisma.auditLog.create({
      data: { orgId: ctx.orgId, actorId: ctx.userId, action: "draft.reject", targetType: "Draft", targetId: draft.id },
    }),
  ]);

  revalidatePath("/approvals");
  revalidatePath("/leads");
  return { ok: true, message: "Draft rejected." };
}

export async function approveAllAction(): Promise<AgentActionResult> {
  const ctx = await requireOrg();
  const pending = await prisma.draft.findMany({
    where: { orgId: ctx.orgId, status: "PENDING_APPROVAL" },
    include: { variants: true },
  });

  let approved = 0;
  for (const draft of pending) {
    const variantId = draft.selectedVariantId ?? draft.variants.sort((a, b) => b.confidence - a.confidence)[0]?.id;
    if (!variantId) continue;
    const v = draft.variants.find((x) => x.id === variantId)!;
    await prisma.$transaction([
      prisma.draft.update({
        where: { id: draft.id },
        data: {
          status: "APPROVED",
          selectedVariantId: variantId,
          finalSubject: v.subject,
          finalBody: v.body,
          approvedById: ctx.userId,
          approvedAt: new Date(),
        },
      }),
      prisma.lead.update({ where: { id: draft.leadId }, data: { status: "SCHEDULED", lastTouchAt: new Date() } }),
    ]);
    approved += 1;
  }

  revalidatePath("/approvals");
  revalidatePath("/leads");
  return { ok: true, message: `Approved all ${approved} pending draft(s).` };
}
