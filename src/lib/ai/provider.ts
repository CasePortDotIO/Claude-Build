import { aiConfig, hasAnthropic } from "@/lib/ai/config";
import { callToolUse } from "@/lib/ai/anthropic";
import {
  buildDraftSystemPrompt,
  buildDraftUserPrompt,
  draftToolSchema,
  buildReplySystemPrompt,
  buildReplyUserPrompt,
  buildVoiceLearnSystemPrompt,
  buildVoiceLearnUserPrompt,
  voiceToolSchema,
} from "@/lib/ai/prompts";
import type {
  LLMProvider,
  DraftInput,
  DraftResult,
  DraftVariantOut,
  ReplyDraftInput,
  VoiceLearnInput,
  VoiceLearnResult,
} from "@/lib/ai/types";

// ── Real provider: Claude via the Messages API with forced tool use ─────────
interface RawDraftToolInput {
  overall_rationale: string;
  variants: {
    angle: string;
    subject: string;
    body: string;
    opening_line: string;
    confidence: number;
    rationale: string;
  }[];
}

interface RawVoiceToolInput {
  tone: string;
  sentence_length: string;
  emoji_use: string;
  greeting: string;
  sign_off: string;
  signature_move: string;
  summary: string;
  do_rules: string[];
  dont_rules: string[];
}

class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  readonly model = aiConfig.anthropic.model;

  async draftReengagement(input: DraftInput): Promise<DraftResult> {
    const { input: out, usage } = await callToolUse<RawDraftToolInput>({
      model: this.model,
      system: buildDraftSystemPrompt(input),
      userContent: buildDraftUserPrompt(input),
      tool: draftToolSchema(input.variantCount),
      maxTokens: 2000,
    });
    return {
      variants: out.variants.map((v) => ({
        angle: v.angle,
        subject: v.subject,
        body: v.body,
        openingLine: v.opening_line,
        confidence: clamp01(v.confidence),
        rationale: v.rationale,
      })),
      overallRationale: out.overall_rationale,
      usage,
      provider: this.name,
      model: this.model,
    };
  }

  async draftReply(input: ReplyDraftInput): Promise<DraftResult> {
    const { input: out, usage } = await callToolUse<RawDraftToolInput>({
      model: this.model,
      system: buildReplySystemPrompt(input),
      userContent: buildReplyUserPrompt(input),
      tool: draftToolSchema(input.variantCount),
      maxTokens: 1500,
    });
    return {
      variants: out.variants.map((v) => ({
        angle: v.angle,
        subject: v.subject,
        body: v.body,
        openingLine: v.opening_line,
        confidence: clamp01(v.confidence),
        rationale: v.rationale,
      })),
      overallRationale: out.overall_rationale,
      usage,
      provider: this.name,
      model: this.model,
    };
  }

  async learnVoice(input: VoiceLearnInput): Promise<VoiceLearnResult> {
    const { input: out, usage } = await callToolUse<RawVoiceToolInput>({
      model: this.model,
      system: buildVoiceLearnSystemPrompt(),
      userContent: buildVoiceLearnUserPrompt(input),
      tool: voiceToolSchema(),
      maxTokens: 1200,
    });
    return {
      profile: {
        tone: out.tone,
        sentenceLength: out.sentence_length,
        emojiUse: out.emoji_use,
        greeting: out.greeting,
        signOff: out.sign_off,
        signatureMove: out.signature_move,
        summary: out.summary,
        doRules: out.do_rules,
        dontRules: out.dont_rules,
      },
      usage,
      provider: this.name,
      model: this.model,
    };
  }
}

// ── Deterministic stub: no key, no network, grounded only in real memory ────
// Produces real, sendable copy from the lead's actual fields so the whole flow
// is demoable + testable offline. It NEVER asserts a fact not in LeadMemory.
export class StubProvider implements LLMProvider {
  readonly name = "stub";
  readonly model = "warm-sweep-stub-v1";

  async draftReengagement(input: DraftInput): Promise<DraftResult> {
    const { lead, voice, operatorName, optOutLine } = input;
    const greeting = voice.greeting.replace(/\{\{\s*firstName\s*\}\}/g, lead.firstName || "there");
    const signOff = voice.signOff.replace(/\{\{\s*operator\s*\}\}/g, operatorName);

    // Only reference goal/inquiry when we actually have them.
    const goal = lead.statedGoal?.trim();
    const inquiry = lead.originalInquiry?.trim();

    const angles: { angle: string; opener: string; ask: string; base: number }[] = [
      {
        angle: "goal-led",
        opener: goal
          ? `Back when we first spoke, you were focused on ${lowerFirst(goal)}.`
          : inquiry
            ? `A while back you reached out about ${lowerFirst(inquiry)}.`
            : `It's been a little while since we last connected.`,
        ask: `Is that still where your head's at? If so, I'd love to help — want me to send over a simple next step?`,
        base: goal ? 0.84 : 0.66,
      },
      {
        angle: "curiosity",
        opener: inquiry
          ? `I was thinking about your question on ${lowerFirst(inquiry)} and realized I never closed the loop.`
          : `I realized I never properly closed the loop with you.`,
        ask: `No pressure at all — would it be useful if I shared how I'd approach it for you?`,
        base: inquiry ? 0.78 : 0.62,
      },
      {
        angle: "direct",
        opener: goal
          ? `Quick one: are you still working toward ${lowerFirst(goal)}?`
          : `Quick one — is this still on your radar?`,
        ask: `If yes, are you open to a short 15-minute call this week? If not, no worries and I'll leave you be.`,
        base: 0.72,
      },
    ];

    const chosen = angles.slice(0, Math.max(2, Math.min(3, input.variantCount)));
    const variants: DraftVariantOut[] = chosen.map((a, i) => {
      const body = [`${greeting}`, ``, a.opener, ``, a.ask, ``, signOff, ``, optOutLine].join("\n");
      const subject = subjectFor(a.angle, lead);
      return {
        angle: a.angle,
        subject,
        body,
        openingLine: a.opener,
        confidence: round2(a.base - i * 0.03),
        rationale: groundedRationale(a.angle, lead),
      };
    });

    const usage = estimateUsage(buildDraftUserPrompt(input), variants.map((v) => v.body).join("\n"));
    return {
      variants,
      overallRationale:
        "Deterministic stub draft grounded only in this lead's recorded memory. Set ANTHROPIC_API_KEY to use Claude for richer copy.",
      usage,
      provider: this.name,
      model: this.model,
    };
  }

  async draftReply(input: ReplyDraftInput): Promise<DraftResult> {
    const { lead, voice, operatorName, optOutLine, availability } = input;
    const greeting = voice.greeting.replace(/\{\{\s*firstName\s*\}\}/g, lead.firstName || "there");
    const signOff = voice.signOff.replace(/\{\{\s*operator\s*\}\}/g, operatorName);

    const offer = availability.length
      ? `I've got ${availability.slice(0, 2).join(" or ")} open — would either work?`
      : `I could do tomorrow afternoon or Thursday morning — would either of those work for a quick 15 minutes?`;

    const count = Math.max(1, Math.min(2, input.variantCount));
    const variants: DraftVariantOut[] = [];
    const bodyA = [greeting, ``, `Great to hear back from you — glad the timing works.`, ``, offer, ``, signOff, ``, optOutLine].join("\n");
    variants.push({
      angle: "book-the-call",
      subject: "Re: let's find a time",
      body: bodyA,
      openingLine: "Great to hear back from you — glad the timing works.",
      confidence: 0.82,
      rationale: "They replied positively; offer concrete times to convert to a booking.",
    });
    if (count === 2) {
      const bodyB = [greeting, ``, `Love it. Rather than go back and forth, want me to send a quick booking link so you can grab whatever slot suits you?`, ``, signOff, ``, optOutLine].join("\n");
      variants.push({
        angle: "send-link",
        subject: "Re: easiest way to grab a time",
        body: bodyB,
        openingLine: "Love it.",
        confidence: 0.74,
        rationale: "Lower-friction alternative: let them self-serve a time.",
      });
    }

    return {
      variants,
      overallRationale: "Deterministic stub reply that responds to the lead and moves toward a booked call.",
      usage: estimateUsage(buildReplyUserPrompt(input), variants.map((v) => v.body).join("\n")),
      provider: this.name,
      model: this.model,
    };
  }

  async learnVoice(input: VoiceLearnInput): Promise<VoiceLearnResult> {
    const bodies = input.samples.map((s) => s.body);
    const text = bodies.join("\n");

    const sentences = text.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
    const avgWords = sentences.length
      ? sentences.reduce((n, s) => n + s.split(/\s+/).length, 0) / sentences.length
      : 0;
    const sentenceLength =
      avgWords < 12 ? "Short. Punchy." : avgWords < 20 ? "Medium, conversational." : "Longer, detailed.";

    const hasEmoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(text);
    const emojiUse = hasEmoji ? "Occasional, friendly" : "Rare, never salesy";

    // Greeting = first line that looks like a salutation; sign-off = last line.
    const firstLine = bodies[0]?.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
    const greeting = /^(hi|hey|hello)\b/i.test(firstLine)
      ? `${firstLine.split(/[, ]/)[0]} {{firstName}},`
      : "Hi {{firstName}},";
    const lines0 = (bodies[0] ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
    const signOff = lines0.length > 1 ? `${lines0[lines0.length - 1]}` : "— {{operator}}";

    return {
      profile: {
        tone: "Warm, direct, no fluff",
        sentenceLength,
        emojiUse,
        greeting,
        signOff,
        signatureMove: "Ask, don't pitch",
        summary: `Learned from ${input.samples.length} past emails. Writes the way they would on a good day: ${sentenceLength.toLowerCase()} ${emojiUse.toLowerCase()}.`,
        doRules: [],
        dontRules: [],
      },
      usage: estimateUsage(text, ""),
      provider: this.name,
      model: this.model,
    };
  }
}

// ── factory ─────────────────────────────────────────────────────────────────
let cached: LLMProvider | null = null;

export function getLLMProvider(): LLMProvider {
  if (cached) return cached;
  cached = hasAnthropic() ? new AnthropicProvider() : new StubProvider();
  return cached;
}

export function __resetProvider() {
  cached = null;
}

// ── helpers ──────────────────────────────────────────────────────────────────
function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
function round2(n: number): number {
  return Math.round(clamp01(n) * 100) / 100;
}
function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}
function subjectFor(angle: string, lead: { firstName?: string | null; statedGoal?: string | null }): string {
  const name = lead.firstName ? `${lead.firstName}, ` : "";
  if (angle === "goal-led" && lead.statedGoal) return `${name}still thinking about this?`;
  if (angle === "curiosity") return `${name}a quick thought`;
  return `${name}where did this land?`;
}
function groundedRationale(angle: string, lead: { statedGoal?: string | null; originalInquiry?: string | null }): string {
  if (angle === "goal-led" && lead.statedGoal) return "Leads with their stated goal — the highest-signal hook we have on record.";
  if (angle === "curiosity" && lead.originalInquiry) return "Reopens their own original question without pitching.";
  return "Low-friction yes/no ask that respects that they went quiet.";
}
// Rough token estimate (~4 chars/token) so agent_runs has plausible numbers offline.
function estimateUsage(input: string, output: string) {
  return {
    promptTokens: Math.ceil(input.length / 4),
    completionTokens: Math.ceil(output.length / 4),
  };
}
