import { prisma } from "@/lib/prisma";
import { getLLMProvider } from "@/lib/ai/provider";
import { retrieveSimilar } from "@/lib/memory";
import { estimateCostUsd } from "@/lib/ai/config";
import { defaultVoiceProfile } from "@/lib/agent/voice";
import { computeVoiceFidelity } from "@/lib/agent/voice-match";
import { assertContactable, ComplianceError } from "@/lib/compliance";
import { assignCohort } from "@/lib/agent/rollups";
import type { DraftInput, VoiceProfileShape } from "@/lib/ai/types";
import type { Lead } from "@prisma/client";

export class DraftGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DraftGuardError";
  }
}

export function buildOptOutLine(): string {
  // Plain-text opt-out in every email (§5/§9). The CAN-SPAM physical address is
  // appended by the send pipeline in M5; this is the per-message opt-out.
  return "If you'd rather not hear from me, just reply 'stop' and I won't reach out again.";
}

/**
 * Generate re-engagement drafts for one lead and queue them for approval.
 *
 * Hard rails enforced here, never bypassable:
 *  - refuse if the lead is opted-out / do-not-contact / bounced / already booked,
 *  - refuse if the lead's email is on the org suppression list.
 * On success: supersede any prior pending draft, persist Draft + variants, log an
 * AgentRun, and move the lead to AWAITING_APPROVAL. No email is sent (that's M3).
 */
export async function generateDraftsForLead(opts: {
  orgId: string;
  leadId: string;
  operatorName: string;
  variantCount?: number;
}) {
  const start = Date.now();
  const { orgId, leadId, operatorName, variantCount = 3 } = opts;

  const lead = await prisma.lead.findFirst({ where: { id: leadId, orgId } });
  if (!lead) throw new DraftGuardError("Lead not found in this workspace.");

  // Single contactability gate (suppression + opt-out + DNC + terminal).
  try {
    await assertContactable(orgId, lead.email, lead.status);
  } catch (e) {
    if (e instanceof ComplianceError) throw new DraftGuardError(e.message);
    throw e;
  }

  // Load the org's voice profile (or defaults).
  const storedProfile = await prisma.voiceProfile.findUnique({ where: { orgId } });
  const voice: VoiceProfileShape = storedProfile
    ? {
        tone: storedProfile.tone,
        sentenceLength: storedProfile.sentenceLength,
        emojiUse: storedProfile.emojiUse,
        greeting: storedProfile.greeting,
        signOff: storedProfile.signOff,
        signatureMove: storedProfile.signatureMove,
        summary: storedProfile.summary,
        doRules: storedProfile.doRules,
        dontRules: storedProfile.dontRules,
      }
    : defaultVoiceProfile();

  // Retrieve voice exemplars + similar past objections from semantic memory.
  const retrievalQuery = [lead.statedGoal, lead.originalInquiry, ...(lead.objections ?? [])]
    .filter(Boolean)
    .join(" ")
    .trim() || (lead.firstName ?? lead.email);

  const [voiceSamples, similarObjections, learning] = await Promise.all([
    retrieveSimilar({ orgId, query: retrievalQuery, k: 3, kinds: ["VOICE_SAMPLE"] }),
    retrieveSimilar({ orgId, query: retrievalQuery, k: 3, kinds: ["OBJECTION"] }),
    prisma.orgLearning.findUnique({ where: { orgId } }),
  ]);

  // M6: stable A/B cohort. HOLDOUT leads get baseline copy so lift is measured.
  const cohort = lead.cohort ?? assignCohort(orgId, lead.id);
  if (lead.cohort !== cohort) {
    await prisma.lead.update({ where: { id: lead.id }, data: { cohort } });
  }

  const input: DraftInput = {
    lead: {
      firstName: lead.firstName,
      company: lead.company,
      originalInquiry: lead.originalInquiry,
      statedGoal: lead.statedGoal,
      toneRead: lead.toneRead,
      objections: lead.objections ?? [],
    },
    voice,
    operatorName,
    optOutLine: buildOptOutLine(),
    voiceSamples: voiceSamples.map((m) => m.content),
    similarObjections: similarObjections.map((m) => m.content),
    variantCount,
    cohort,
    retiredPhrases: learning?.retiredPhrases ?? [],
    promotedOpeners: learning?.promotedOpeners ?? [],
  };

  // Reason: call the provider (Claude or stub).
  const provider = getLLMProvider();
  const result = await provider.draftReengagement(input);

  // M9: score each variant's voice fidelity against the operator's own past
  // emails — deterministic, no extra model call — so approval can show the proof.
  const sampleTexts = voiceSamples.map((m) => m.content);
  const fidelity = result.variants.map((v) =>
    computeVoiceFidelity({ body: v.body, voice, voiceSamples: sampleTexts, confidence: v.confidence }),
  );

  // Act: persist the audit run, supersede old drafts, create the new draft.
  const draft = await prisma.$transaction(async (tx) => {
    const run = await tx.agentRun.create({
      data: {
        orgId,
        leadId,
        step: "DRAFT",
        provider: result.provider,
        model: result.model,
        inputSummary: summarizeInput(lead, voiceSamples.length, similarObjections.length),
        decision: { overallRationale: result.overallRationale, variantCount: result.variants.length } as object,
        rationale: result.overallRationale,
        confidence: result.variants[0]?.confidence ?? null,
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
        costUsd:
          result.provider === "anthropic"
            ? estimateCostUsd(result.model, result.usage.promptTokens, result.usage.completionTokens)
            : 0,
        latencyMs: Date.now() - start,
      },
    });

    await tx.draft.updateMany({
      where: { orgId, leadId, status: "PENDING_APPROVAL" },
      data: { status: "SUPERSEDED" },
    });

    const created = await tx.draft.create({
      data: {
        orgId,
        leadId,
        status: "PENDING_APPROVAL",
        agentRunId: run.id,
        variants: {
          create: result.variants.map((v, i) => ({
            index: i,
            angle: v.angle,
            subject: v.subject,
            body: v.body,
            openingLine: v.openingLine,
            confidence: v.confidence,
            rationale: v.rationale,
            voiceMatch: fidelity[i]?.match ?? null,
            voiceEcho: fidelity[i]?.echo ?? null,
          })),
        },
      },
      include: { variants: { orderBy: { index: "asc" } } },
    });

    // Default the selected variant to the highest-confidence one.
    const best = [...created.variants].sort((a, b) => b.confidence - a.confidence)[0];
    await tx.draft.update({ where: { id: created.id }, data: { selectedVariantId: best?.id } });

    // Observe: advance the lead's state.
    await tx.lead.update({ where: { id: leadId }, data: { status: "AWAITING_APPROVAL" } });

    return { ...created, selectedVariantId: best?.id ?? null };
  });

  return draft;
}

function summarizeInput(lead: Lead, voiceCount: number, objCount: number): string {
  const bits = [
    `lead=${lead.firstName ?? lead.email}`,
    lead.statedGoal ? `goal="${lead.statedGoal.slice(0, 60)}"` : "goal=none",
    `voiceSamples=${voiceCount}`,
    `objections=${objCount}`,
  ];
  return bits.join(" ");
}
