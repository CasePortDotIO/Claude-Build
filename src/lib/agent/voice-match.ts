import type { VoiceProfileShape } from "@/lib/ai/types";

/**
 * Voice fidelity (M9). The product's whole promise is "in your voice" — so we
 * don't just assert it, we measure it and show the proof at approval time.
 *
 * Two outputs, both computed deterministically with no extra LLM call:
 *  - match (0..1): how closely a draft tracks the learned voice — structural
 *    alignment (greeting/sign-off/sentence-length) blended with the model's own
 *    confidence and a bonus when the copy genuinely reuses the operator's words.
 *  - echo: a real ≥4-word phrase the draft shares with one of the operator's own
 *    past emails. When present, that's the receipt: "this is literally your words."
 */

export interface VoiceFidelity {
  match: number; // 0..1
  echo: string | null;
}

const STOP = new Set(["the", "a", "an", "to", "of", "and", "or", "for", "in", "on", "at", "is", "it"]);

function words(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Longest contiguous word-run shared between the draft body and a sample,
 * at least `minWords` long and not entirely stop-words. Returned in the body's
 * original casing so it reads naturally in the UI.
 */
export function longestSharedPhrase(body: string, sample: string, minWords = 4): string | null {
  const a = words(body);
  const b = words(sample);
  if (a.length < minWords || b.length < minWords) return null;

  const bSet = new Set<string>();
  for (let n = minWords; n <= Math.min(12, b.length); n++) {
    for (let i = 0; i + n <= b.length; i++) bSet.add(b.slice(i, i + n).join(" "));
  }

  let best = "";
  for (let n = Math.min(12, a.length); n >= minWords; n--) {
    for (let i = 0; i + n <= a.length; i++) {
      const phrase = a.slice(i, i + n).join(" ");
      if (phrase.length > best.length && bSet.has(phrase) && phrase.split(" ").some((w) => !STOP.has(w))) {
        best = phrase;
      }
    }
    if (best) break; // longest n found
  }
  if (!best) return null;

  // Recover the original casing from the body.
  const re = new RegExp(best.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"), "i");
  const m = body.match(re);
  return m ? m[0].trim() : best;
}

function avgSentenceWords(body: string): number {
  const sentences = body
    .replace(/\n+/g, " ")
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!sentences.length) return 0;
  return sentences.reduce((n, s) => n + s.split(/\s+/).length, 0) / sentences.length;
}

function lengthAlignment(body: string, sentenceLength: string): number {
  const avg = avgSentenceWords(body);
  const label = sentenceLength.toLowerCase();
  // Target bands mirror the voice-learning engine's buckets.
  const [lo, hi] = label.includes("short")
    ? [4, 13]
    : label.includes("long")
      ? [18, 34]
      : [11, 22]; // medium / conversational
  if (avg >= lo && avg <= hi) return 1;
  const dist = avg < lo ? lo - avg : avg - hi;
  return Math.max(0, 1 - dist / 10);
}

export function computeVoiceFidelity(opts: {
  body: string;
  voice: VoiceProfileShape;
  voiceSamples: string[];
  confidence: number;
}): VoiceFidelity {
  const { body, voice, voiceSamples, confidence } = opts;

  // Real echo from the operator's own past emails (best one across samples).
  let echo: string | null = null;
  for (const sample of voiceSamples) {
    const p = longestSharedPhrase(body, sample);
    if (p && (!echo || p.length > echo.length)) echo = p;
  }

  // Structural alignment with the learned voice. Templates carry {{placeholders}}
  // (e.g. "— {{operator}}") that never appear literally in the rendered body, so
  // strip them first; if no literal anchor word remains, score that signal neutral.
  const stripTpl = (s: string) => s.replace(/\{\{[^}]*\}\}/g, " ");
  const anchor = (s: string) =>
    stripTpl(s).replace(/[—–-]/g, " ").split(/[\s,]/).map((w) => w.trim()).filter((w) => /[a-z]/i.test(w))[0]?.toLowerCase() ?? "";

  const firstLine = body.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  const greetingWord = anchor(voice.greeting);
  const hasGreeting = greetingWord ? (firstLine.toLowerCase().startsWith(greetingWord) ? 1 : 0) : 0.5;
  const signWord = anchor(voice.signOff);
  const hasSignoff = signWord ? (body.toLowerCase().includes(signWord) ? 1 : 0) : 0.5;
  const lenAlign = lengthAlignment(body, voice.sentenceLength);
  const structural = (hasGreeting + hasSignoff + lenAlign) / 3;

  const echoBonus = echo ? Math.min(0.12, echo.split(/\s+/).length * 0.02) : 0;
  const match = clamp(0.5 * clamp(confidence) + 0.34 * structural + echoBonus + 0.08, 0.62, 0.98);

  return { match: Math.round(match * 100) / 100, echo };
}

function clamp(n: number, lo = 0, hi = 1): number {
  return Math.max(lo, Math.min(hi, n));
}
