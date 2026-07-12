import { prisma } from "@/lib/prisma";
import { getLLMProvider, StubProvider } from "@/lib/ai/provider";
import { retrieveSimilar } from "@/lib/memory";
import { estimateCostUsd } from "@/lib/ai/config";
import { defaultVoiceProfile } from "@/lib/agent/voice";
import { computeVoiceFidelity } from "@/lib/agent/voice-match";
import { assertContactable, ComplianceError } from "@/lib/compliance";
import { assignCohort } from "@/lib/agent/rollups";
import { assertDraftAllowed, recordDraft } from "@/lib/billing/meter";
import { angleArm } from "@/lib/agent/experiments";
import { DraftGuardError } from "@/lib/agent/draft-errors";
import type { DraftInput, DraftResult, VoiceProfileShape } from "@/lib/ai/types";
import type { Lead } from "@prisma/client";

// Re-exported so existing importers (autopilot, follow-ups, actions) are unaffected.
export { DraftGuardError };

export function buildOptOutLine(): string {
  // Plain-text opt-out in every email (§5/§9). The CAN-SPAM physical address is
  // appended by the send pipeline in M5; this is the per-message opt-out.
  return "If you'd rather not hear from me, just reply 'stop' and I won't reach out again.";
}

// Retrieve semantic memory, but never let an embedding/retrieval failure abort
// the whole draft run — these results are optional context, so on error we log
// and continue with none.
async function safeRetrieve(
  opts: Parameters<typeof retrieveSimilar>[0],
): ReturnType<typeof retrieveSimilar> {
  try {
    return await retrieveSimilar(opts);
  } catch (e) {
    console.error(
      `[draft] memory retrieval failed (kinds=${opts.kinds?.join(",") ?? "all"}); continuing without it:`,
      e instanceof Error ? e.message : e,
    );
    return [];
  }
}

export interface DraftContextOpts {
  orgId: string;
  leadId: string;
  operatorName: string;
  variantCount?: number;
  followUp?: { touch: number; isFinal: boolean; previousSubject?: string | null };
  // Cron/autopilot volume work — routes drafting to the fast model tier.
  bulk?: boolean;
}

/**
 * Gather everything one draft needs — lead, voice profile, retrieved memory,
 * cohort — and enforce the hard rails (contactability + suppression), which are
 * never bypassable. Shared by realtime drafting and the batched autopilot path
 * so both run the exact same guards and prompt inputs.
 */
export async function buildDraftContext(opts: DraftContextOpts): Promise<{ lead: Lead; input: DraftInput }> {
  const { orgId, leadId, operatorName, variantCount = 3, followUp, bulk } = opts;

  const lead = await prisma.lead.findFirst({ where: { id: leadId, orgId } });
  if (!lead) throw new DraftGuardError("Lead not found in this workspace.");

  // Margin kill-switch: refuse once the org hits its plan's monthly draft cap.
  await assertDraftAllowed(orgId);

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

  // Voice exemplars + objection memory are *enhancements*, not requirements:
  // if the embedder (e.g. Voyage) is misconfigured or down, drafting must still
  // proceed grounded in the lead's own fields rather than failing the whole run.
  const [voiceSamples, similarObjections, learning] = await Promise.all([
    safeRetrieve({ orgId, query: retrievalQuery, k: 3, kinds: ["VOICE_SAMPLE"] }),
    safeRetrieve({ orgId, query: retrievalQuery, k: 3, kinds: ["OBJECTION"] }),
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
    tier: bulk ? "bulk" : "interactive",
    cohort,
    retiredPhrases: learning?.retiredPhrases ?? [],
    promotedOpeners: learning?.promotedOpeners ?? [],
    followUp,
  };

  return { lead, input };
}

/**
 * Persist a completed draft result: score voice fidelity, log the AgentRun,
 * supersede prior pending drafts, create the new draft + variants, and advance
 * the lead to AWAITING_APPROVAL. Shared by realtime and batched paths.
 * costMultiplier covers the Message Batches discount (batched runs bill 50%).
 */
export async function persistDraftResult(opts: {
  orgId: string;
  leadId: string;
  lead: Lead;
  input: DraftInput;
  result: DraftResult;
  startMs: number;
  costMultiplier?: number;
}) {
  const { orgId, leadId, lead, input, result, startMs, costMultiplier = 1 } = opts;

  // M9: score each variant's voice fidelity against the operator's own past
  // emails — deterministic, no extra model call — so approval can show the proof.
  const fidelity = result.variants.map((v) =>
    computeVoiceFidelity({ body: v.body, voice: input.voice, voiceSamples: input.voiceSamples, confidence: v.confidence }),
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
        inputSummary: summarizeInput(lead),
        decision: { overallRationale: result.overallRationale, variantCount: result.variants.length } as object,
        rationale: result.overallRationale,
        confidence: result.variants[0]?.confidence ?? null,
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
        costUsd:
          result.provider === "anthropic"
            ? estimateCostUsd(result.model, result.usage.promptTokens, result.usage.completionTokens) * costMultiplier
            : 0,
        latencyMs: Date.now() - startMs,
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

    // Select the highest-confidence variant, but honor the lead's opening-angle
    // experiment arm when a matching variant exists — so the angle actually SENT
    // equals the logged arm, keeping the corpus causal. Both variants are
    // model-generated and viable, so this trades ~nothing in quality for clean
    // experimental data. Falls back to top-confidence when the angle isn't present.
    const ranked = [...created.variants].sort((a, b) => b.confidence - a.confidence);
    const preferredAngle = angleArm(leadId);
    const best = ranked.find((v) => v.angle === preferredAngle) ?? ranked[0];
    await tx.draft.update({ where: { id: created.id }, data: { selectedVariantId: best?.id } });

    // Observe: advance the lead's state.
    await tx.lead.update({ where: { id: leadId }, data: { status: "AWAITING_APPROVAL" } });

    return { ...created, selectedVariantId: best?.id ?? null };
  });

  // Count against the throughput meter only for real (LLM) drafts — the stub
  // fallback is free and must not consume a customer's paid allowance.
  if (result.provider === "anthropic") {
    await recordDraft(orgId);
  }

  return draft;
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
export async function generateDraftsForLead(opts: DraftContextOpts) {
  const start = Date.now();
  const { lead, input } = await buildDraftContext(opts);

  // Reason: call the provider (Claude or stub). If a keyed provider fails at
  // request time (bad/expired key, quota, upstream outage), fall back to the
  // deterministic stub so the operator still gets a sendable, grounded draft
  // instead of a dead button. The failure is logged for diagnosis.
  const provider = await getLLMProvider();
  let result;
  try {
    result = await provider.draftReengagement(input);
  } catch (e) {
    console.error(
      `[draft] provider "${provider.name}" failed for lead ${opts.leadId}; falling back to stub:`,
      e instanceof Error ? e.message : e,
    );
    result = await new StubProvider().draftReengagement(input);
  }

  return persistDraftResult({ orgId: opts.orgId, leadId: opts.leadId, lead, input, result, startMs: start });
}

// Human sentence for the operator-facing activity log — never debug key=value
// dumps. Internals (tokens, model, retrieval counts) stay in the run row's
// structured fields, not in copy a customer reads.
function summarizeInput(lead: Lead): string {
  const who = lead.firstName ?? lead.email;
  return lead.statedGoal ? `For ${who} — they wanted "${lead.statedGoal.slice(0, 80)}"` : `For ${who}`;
}
