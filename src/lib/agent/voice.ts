import { prisma } from "@/lib/prisma";
import { getLLMProvider } from "@/lib/ai/provider";
import { storeMemoryBatch } from "@/lib/memory";
import { estimateCostUsd } from "@/lib/ai/config";
import { DEFAULT_DO_RULES, DEFAULT_DONT_RULES, type VoiceProfileShape } from "@/lib/ai/types";

export interface LearnVoiceInput {
  orgId: string;
  operatorName: string;
  samples: { subject?: string | null; body: string }[];
}

/**
 * Learn (or relearn) the org's voice profile from past emails.
 * Side effects, all org-scoped:
 *  - persists each email as a VoiceSample,
 *  - embeds each as VOICE_SAMPLE memory (retrieved later when drafting),
 *  - calls the LLM to extract a structured profile,
 *  - upserts VoiceProfile, falling back to default do/don't rules,
 *  - logs an AgentRun (VOICE_LEARN) with tokens + cost.
 */
export async function learnVoice(input: LearnVoiceInput) {
  const start = Date.now();
  const provider = await getLLMProvider();

  // 1. Persist raw samples.
  const created = await prisma.$transaction(
    input.samples.map((s) =>
      prisma.voiceSample.create({ data: { orgId: input.orgId, subject: s.subject ?? null, body: s.body } }),
    ),
  );

  // 2. Embed them into semantic memory.
  await storeMemoryBatch(
    created.map((c) => ({
      orgId: input.orgId,
      kind: "VOICE_SAMPLE" as const,
      content: c.body,
      sourceId: c.id,
    })),
  );

  // 3. Extract the profile.
  const result = await provider.learnVoice({ samples: input.samples, operatorName: input.operatorName });
  const p = result.profile;
  const doRules = p.doRules.length ? p.doRules : DEFAULT_DO_RULES;
  const dontRules = p.dontRules.length ? p.dontRules : DEFAULT_DONT_RULES;

  const totalSamples = await prisma.voiceSample.count({ where: { orgId: input.orgId } });

  // 4. Upsert the profile.
  const profile = await prisma.voiceProfile.upsert({
    where: { orgId: input.orgId },
    create: {
      orgId: input.orgId,
      tone: p.tone,
      sentenceLength: p.sentenceLength,
      emojiUse: p.emojiUse,
      greeting: p.greeting,
      signOff: p.signOff,
      signatureMove: p.signatureMove,
      summary: p.summary,
      doRules,
      dontRules,
      sampleCount: totalSamples,
      source: "learned",
    },
    update: {
      tone: p.tone,
      sentenceLength: p.sentenceLength,
      emojiUse: p.emojiUse,
      greeting: p.greeting,
      signOff: p.signOff,
      signatureMove: p.signatureMove,
      summary: p.summary,
      doRules,
      dontRules,
      sampleCount: totalSamples,
      source: "learned",
    },
  });

  // 5. Audit.
  await prisma.agentRun.create({
    data: {
      orgId: input.orgId,
      step: "VOICE_LEARN",
      provider: result.provider,
      model: result.model,
      inputSummary: `Learned voice from ${input.samples.length} samples (org now has ${totalSamples}).`,
      decision: p as unknown as object,
      promptTokens: result.usage.promptTokens,
      completionTokens: result.usage.completionTokens,
      costUsd: result.provider === "anthropic" ? estimateCostUsd(result.model, result.usage.promptTokens, result.usage.completionTokens) : 0,
      latencyMs: Date.now() - start,
    },
  });

  return profile;
}

// The default profile used before any learning has happened.
export function defaultVoiceProfile(): VoiceProfileShape {
  return {
    tone: "Warm, direct, no fluff",
    sentenceLength: "Short. Punchy.",
    emojiUse: "Rare, never salesy",
    greeting: "Hi {{firstName}},",
    signOff: "— {{operator}}",
    signatureMove: "Ask, don't pitch",
    summary: null,
    doRules: DEFAULT_DO_RULES,
    dontRules: DEFAULT_DONT_RULES,
  };
}
