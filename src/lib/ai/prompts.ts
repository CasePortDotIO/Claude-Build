import type { DraftInput, ReplyDraftInput, VoiceLearnInput } from "@/lib/ai/types";

/**
 * Prompt construction for the draft + voice-learning steps. Kept separate from
 * the providers so the exact grounding text is auditable and shared by the real
 * and stub providers (the stub uses the same facts, just deterministically).
 */

export function buildDraftSystemPrompt(input: DraftInput): string {
  const { voice, operatorName } = input;
  return [
    `You are the copywriting engine for "The Warm Sweep" — and you write at the`,
    `level of the top 0.01% of direct-response copywriters. You revive a *prior*`,
    `contact who went cold. This is reactivation, not cold outreach: the person`,
    `already inquired with ${operatorName} and raised their hand once. Your single`,
    `job is to move them from cold lead to a booked call they're actually looking`,
    `forward to — using earned relevance, not pressure.`,
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
    `PERSUASION DOCTRINE (apply every one of these):`,
    `1. One email, one idea, one ask. Every sentence must pull toward the call. Cut the rest.`,
    `2. Specificity IS the persuasion. Say their own words back — their exact inquiry and stated goal. Concrete beats clever, always.`,
    `3. Earn the open. The subject and first line do 80% of the work: spark a curiosity gap OR name their specific goal. Never "just checking in" or "hope you're well".`,
    `4. Future-pace the outcome, not the offer. Put the result they wanted into motion ("the consistency you were after is one short conversation away"). Don't list features or services.`,
    `5. Micro-commitment CTA. Ask for the smallest possible yes ("worth a quick look?", "want me to send a couple of times?"). Never a heavy calendar negotiation.`,
    `6. Honest loss-framing. Reference the real cost of staying stuck, or a real timeline they mentioned. NEVER a fake deadline or invented scarcity.`,
    `7. Status & identity. Speak to who they're trying to become; mirror their tone read.`,
    `8. Proof only if true. One concrete, real result outweighs every adjective. If you have no proof point, win on relevance — don't manufacture claims.`,
    `9. Rhythm. Short. Human. Like a real person typed it at their desk between meetings. Vary sentence length; it should read aloud naturally.`,
    `10. The last line lingers — it's the most-read line after the subject. End on the easiest possible yes or an open loop the call will close.`,
    ``,
    `SUBJECT LINES: short (aim 2–5 words), lowercase and personal — like a one-to-one note, not a campaign. Curiosity or specificity. No spam triggers (no ALL CAPS, "FREE", "!!!", "$$$").`,
    ``,
    `ANGLES: make each variant a genuinely DISTINCT psychological angle (a real test, not a reword). Choose the ones that fit this lead from: goal-led, curiosity-gap, cost-of-inaction, social-proof (only if a real proof point exists in memory), pure-ease (a single frictionless line), pattern-interrupt.`,
    ``,
    `DO:`,
    ...voice.doRules.map((r) => `- ${r}`),
    ``,
    `DON'T:`,
    ...voice.dontRules.map((r) => `- ${r}`),
    ``,
    `Persuasive never means deceptive — and on a warm list it's also self-defeating:`,
    `manipulation gets you marked as spam and you stop reaching everyone. Ground`,
    `every personalization in the provided memory only. If a fact isn't given, don't`,
    `assert it. Always include the provided one-line opt-out verbatim at the end.`,
    input.cohort === "HOLDOUT"
      ? `\nThis is an A/B CONTROL message: ignore the doctrine's goal-led/curiosity openers and use a neutral "just checking in" style — do NOT lead with their specific goal. (We measure the doctrine's true lift against this control.)`
      : "",
    input.retiredPhrases && input.retiredPhrases.length
      ? `\nAvoid these opening lines — they under-performed on real outcomes: ${input.retiredPhrases.map((p) => `"${p}"`).join(", ")}.`
      : "",
    input.promotedOpeners && input.promotedOpeners.length
      ? `\nFavor this opening style — it books the most calls in your data: ${input.promotedOpeners.map((p) => `"${p}"`).join(", ")}. Lead with it when it fits the lead's goal.`
      : "",
    ``,
    `Return ${input.variantCount} distinct variants via the submit_drafts tool,`,
    `each a different angle, each with a calibrated confidence (0–1) reflecting how`,
    `likely THIS lead is to book off it.`,
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
              angle: { type: "string", description: "The psychological angle. One of: 'goal-led', 'curiosity-gap', 'cost-of-inaction', 'social-proof', 'pure-ease', 'pattern-interrupt'. Each variant must use a DIFFERENT angle." },
              subject: { type: "string", description: "2–5 words, lowercase, personal (not a campaign). Curiosity or specificity. No spam triggers." },
              body: { type: "string", description: "The full email body: greeting, hook (first line earns the open), one idea, one micro-commitment ask, sign-off, then the opt-out line verbatim. Short and human." },
              opening_line: { type: "string", description: "The first sentence of the body — it must spark curiosity or name their specific goal; never 'just checking in'." },
              confidence: { type: "number", minimum: 0, maximum: 1, description: "Calibrated likelihood THIS lead books a call off this variant." },
              rationale: { type: "string", description: "One sentence: why this angle should book THIS lead, grounded in their memory." },
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
    `${operatorName}, at the level of the top 0.01% of closers. A prior cold lead`,
    `has REPLIED. You are closing, not pitching: your ONE job is to convert this`,
    `reply into a booked call they're looking forward to — with the least friction`,
    `humanly possible.`,
    ``,
    `Write in their voice: ${voice.tone}; ${voice.sentenceLength}; emoji ${voice.emojiUse}.`,
    `Signature move: ${voice.signatureMove}.`,
    ``,
    `Closing doctrine:`,
    `- Answer the exact thing they said FIRST, in one breath. That earns the right to ask.`,
    `- Then make ONE move to the call. If you have real availability, offer exactly TWO specific options ("Tue 2pm or Wed 10am?") — two concrete choices convert far better than an open "when works?".`,
    `- Future-pace the call: one sentence on what they'll walk away with, so they anticipate it.`,
    `- Handle hesitation by SHRINKING the ask, never by pressure: "even 10 minutes", "nothing to prep", "I'll send a link, grab whatever suits".`,
    `- Mirror their energy and length. If they wrote two lines, don't reply with ten.`,
    `- Exactly one CTA. No second ask, no menu beyond the two times.`,
    `- Ground every word in the thread + memory. Never invent. Include the one-line opt-out verbatim at the end.`,
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
