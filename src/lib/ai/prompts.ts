import type { DraftInput, ReplyDraftInput, VoiceLearnInput } from "@/lib/ai/types";

/**
 * Prompt construction for the draft + voice-learning steps. Kept separate from
 * the providers so the exact grounding text is auditable and shared by the real
 * and stub providers (the stub uses the same facts, just deterministically).
 */

export function buildDraftSystemPrompt(input: DraftInput): string {
  const { voice, operatorName } = input;
  return [
    `You are the copywriting engine for "The Warm Sweep" — you write short, human,`,
    `re-engagement emails that revive a *prior* contact who went cold. This is`,
    `reactivation, not cold outreach: the person already inquired with ${operatorName}.`,
    ``,
    `Write in the operator's voice profile:`,
    `- Tone: ${voice.tone}`,
    `- Sentence length: ${voice.sentenceLength}`,
    `- Emoji: ${voice.emojiUse}`,
    `- Greeting style: ${voice.greeting}`,
    `- Sign-off style: ${voice.signOff}`,
    `- Signature move: ${voice.signatureMove}`,
    voice.summary ? `- Style anchor: ${voice.summary}` : ``,
    ``,
    `DO:`,
    ...voice.doRules.map((r) => `- ${r}`),
    ``,
    `DON'T:`,
    ...voice.dontRules.map((r) => `- ${r}`),
    ``,
    `Persuasive never means deceptive. Ground every personalization in the`,
    `provided memory only. If a fact isn't given, don't assert it.`,
    `Always include the provided one-line opt-out verbatim at the end of the body.`,
    ``,
    `Return ${input.variantCount} distinct variants via the submit_drafts tool,`,
    `each taking a different angle, each with a calibrated confidence (0–1).`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildDraftUserPrompt(input: DraftInput): string {
  const { lead, voiceSamples, similarObjections, optOutLine } = input;
  const lines: string[] = [];
  lines.push(`Lead memory (the ONLY facts you may use):`);
  lines.push(`- First name: ${lead.firstName ?? "(unknown — use a neutral greeting)"}`);
  if (lead.company) lines.push(`- Company: ${lead.company}`);
  lines.push(`- Originally inquired about: ${lead.originalInquiry ?? "(not recorded)"}`);
  lines.push(`- Their stated goal: ${lead.statedGoal ?? "(not recorded)"}`);
  if (lead.toneRead) lines.push(`- Tone read: ${lead.toneRead}`);
  if (lead.objections.length) lines.push(`- Objections they raised: ${lead.objections.join("; ")}`);

  if (voiceSamples.length) {
    lines.push(``, `Operator voice samples (match this voice, do not copy content):`);
    voiceSamples.forEach((s, i) => lines.push(`[sample ${i + 1}] ${truncate(s, 400)}`));
  }
  if (similarObjections.length) {
    lines.push(``, `Similar past objections (handle gently if relevant):`);
    similarObjections.forEach((o) => lines.push(`- ${truncate(o, 200)}`));
  }

  lines.push(``, `One-line opt-out to include verbatim at the end: "${optOutLine}"`);
  return lines.join("\n");
}

// The forced tool schema for drafting. Strict JSON shape (§3).
export function draftToolSchema(variantCount: number) {
  return {
    name: "submit_drafts",
    description: "Submit re-engagement email variants for operator approval.",
    input_schema: {
      type: "object",
      properties: {
        overall_rationale: {
          type: "string",
          description: "Why these angles, grounded in the lead's memory.",
        },
        variants: {
          type: "array",
          minItems: Math.min(2, variantCount),
          maxItems: variantCount,
          items: {
            type: "object",
            properties: {
              angle: { type: "string", description: "Short label, e.g. 'goal-led', 'curiosity', 'direct'." },
              subject: { type: "string" },
              body: { type: "string", description: "The full email body, including greeting, ask, sign-off, and the opt-out line." },
              opening_line: { type: "string", description: "The first sentence of the body." },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              rationale: { type: "string", description: "One sentence: why this should land for THIS lead." },
            },
            required: ["angle", "subject", "body", "opening_line", "confidence", "rationale"],
          },
        },
      },
      required: ["overall_rationale", "variants"],
    },
  } as const;
}

// ── Reply / negotiation drafting ─────────────────────────────────────────────
export function buildReplySystemPrompt(input: ReplyDraftInput): string {
  const { voice, operatorName } = input;
  return [
    `You are handling an ongoing email reply for "The Warm Sweep" on behalf of`,
    `${operatorName}. A prior cold lead has REPLIED. Your job is to move the`,
    `conversation gently toward a booked call — without being pushy.`,
    ``,
    `Write in their voice: ${voice.tone}; ${voice.sentenceLength}; emoji ${voice.emojiUse}.`,
    `Signature move: ${voice.signatureMove}.`,
    ``,
    `Rules:`,
    `- Respond directly to what they actually said. Don't restart the pitch.`,
    `- One clear next step. If you have real availability, offer specific times.`,
    `- If they sound hesitant, lower friction; never guilt or pressure them.`,
    `- Ground everything in the thread + memory. Never invent facts.`,
    `- Include the one-line opt-out verbatim at the end.`,
    ``,
    `Return ${input.variantCount} reply variant(s) via submit_drafts.`,
  ].join("\n");
}

export function buildReplyUserPrompt(input: ReplyDraftInput): string {
  const lines: string[] = [];
  lines.push(`Lead: ${input.lead.firstName ?? "(unknown)"}`);
  if (input.lead.statedGoal) lines.push(`Their goal: ${input.lead.statedGoal}`);
  lines.push(``, `Conversation so far:`);
  for (const t of input.thread) lines.push(`${t.who === "operator" ? "You" : "Them"}: ${truncate(t.text, 300)}`);
  lines.push(``, `Their latest reply (respond to THIS):`, truncate(input.theirReply, 600));
  if (input.availability.length) {
    lines.push(``, `Real availability you may offer: ${input.availability.join(", ")}`);
  } else {
    lines.push(``, `No calendar connected yet — propose a couple of times in words and ask what suits them.`);
  }
  lines.push(``, `One-line opt-out to include verbatim: "${input.optOutLine}"`);
  return lines.join("\n");
}

export function buildVoiceLearnSystemPrompt(): string {
  return [
    `You analyze a set of an operator's past emails and extract their writing`,
    `"voice profile" so future emails sound like them. Be specific and concise.`,
    `Return the profile via the submit_voice_profile tool. Infer do/don't rules`,
    `that fit their style, keeping them ethical (no manipulation, no fake scarcity).`,
  ].join("\n");
}

export function buildVoiceLearnUserPrompt(input: VoiceLearnInput): string {
  const lines = [`Operator: ${input.operatorName}`, `Past emails:`];
  input.samples.forEach((s, i) => {
    lines.push(`--- email ${i + 1} ---`);
    if (s.subject) lines.push(`Subject: ${s.subject}`);
    lines.push(truncate(s.body, 800));
  });
  return lines.join("\n");
}

export function voiceToolSchema() {
  return {
    name: "submit_voice_profile",
    description: "Submit the extracted voice profile.",
    input_schema: {
      type: "object",
      properties: {
        tone: { type: "string" },
        sentence_length: { type: "string" },
        emoji_use: { type: "string" },
        greeting: { type: "string", description: "Greeting style, may use {{firstName}}." },
        sign_off: { type: "string", description: "Sign-off style, may use {{operator}}." },
        signature_move: { type: "string", description: "The operator's signature persuasion move." },
        summary: { type: "string", description: "One paragraph a writer could use as a style anchor." },
        do_rules: { type: "array", items: { type: "string" } },
        dont_rules: { type: "array", items: { type: "string" } },
      },
      required: ["tone", "sentence_length", "emoji_use", "greeting", "sign_off", "signature_move", "summary", "do_rules", "dont_rules"],
    },
  } as const;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
