// Shared types for the agent's reasoning steps. Provider-agnostic.

export interface VoiceProfileShape {
  tone: string;
  sentenceLength: string;
  emojiUse: string;
  greeting: string;
  signOff: string;
  signatureMove: string;
  summary?: string | null;
  doRules: string[];
  dontRules: string[];
}

// Everything the draft engine is allowed to know about a lead — strictly real
// memory. The engine is instructed to use ONLY these facts (no invention).
export interface LeadMemory {
  firstName?: string | null;
  company?: string | null;
  originalInquiry?: string | null;
  statedGoal?: string | null;
  toneRead?: string | null;
  objections: string[];
}

export interface DraftInput {
  lead: LeadMemory;
  voice: VoiceProfileShape;
  operatorName: string;
  optOutLine: string; // one-line opt-out included in every email (§5/§9)
  voiceSamples: string[]; // retrieved exemplars of the operator's voice
  similarObjections: string[]; // retrieved similar past objections
  variantCount: number; // 2–3
}

export interface DraftVariantOut {
  angle: string;
  subject: string;
  body: string;
  openingLine: string;
  confidence: number; // 0..1
  rationale: string;
}

export interface Usage {
  promptTokens: number;
  completionTokens: number;
}

export interface DraftResult {
  variants: DraftVariantOut[];
  overallRationale: string;
  usage: Usage;
  provider: string;
  model: string;
}

export interface VoiceLearnInput {
  samples: { subject?: string | null; body: string }[];
  operatorName: string;
}

export interface VoiceLearnResult {
  profile: VoiceProfileShape;
  usage: Usage;
  provider: string;
  model: string;
}

export interface LLMProvider {
  readonly name: string;
  readonly model: string;
  draftReengagement(input: DraftInput): Promise<DraftResult>;
  learnVoice(input: VoiceLearnInput): Promise<VoiceLearnResult>;
}

// The default §5 draft rules. Operators can edit these per org; they ship as the
// voice profile's doRules/dontRules so the engine always has guardrails.
export const DEFAULT_DO_RULES = [
  "Open with the lead's original goal, not a generic 'just checking in'.",
  "Keep it short and human — a few sentences, like a real person typed it.",
  "Make exactly one clear, low-friction ask.",
  "Use only facts provided in the lead's memory; personalize from those alone.",
  "Sound like the operator's voice profile and samples.",
];

export const DEFAULT_DONT_RULES = [
  "No hype, fake scarcity, false deadlines, or invented social proof.",
  "Never invent facts about the lead or their situation.",
  "No manipulation — if a tactic only works by misleading the reader, don't use it.",
  "Don't be pushy or guilt-trippy; respect that they went quiet.",
];
