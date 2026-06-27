// §5 confidence gate. The category's most common 2–3 star complaint is the AI
// getting "confidently wrong" off-script — answering questions about price or
// specifics it can't verify, mis-qualifying, or sounding like a bot. This
// classifier is deterministic (no LLM call, so it can't itself hallucinate) and
// errs toward routing to a human: when a reply is hostile, ambiguous, or asks
// something we can't safely answer, the agent holds instead of guessing.

export type ReplyIntent = "positive" | "scheduling" | "question" | "objection" | "ambiguous" | "hostile" | "negative";

export interface ReplyAssessment {
  intent: ReplyIntent;
  confidence: number; // 0..1 — how sure we are we understood it
  needsHuman: boolean; // route to the operator instead of an auto-drafted answer
  reason: string; // why (shown to the operator)
}

const HOSTILE = /\b(scam|spam|fraud|lawyer|legal|sue|harass|stop emailing me|leave me alone|never contacted|who (are|is) you|how did you get|reported?)\b/i;
const PROFANITY = /\b(f+u+c+k|sh+i+t|a+s+s+hole|bullshit|piss off)\b/i;
// Questions about things the agent cannot verify and must NOT fabricate.
const UNVERIFIABLE = /\b(how much|pricing|prices?|costs?|do you charge|charges?|fees?|what (do|does) (it|this) cost|refund|guarantee|contract|cancel|discount|exact(ly)? when|which time ?zone|where are you (based|located))\b/i;
const POSITIVE = /\b(yes|yeah|yep|sure|sounds (good|great)|let.?s (talk|do it|chat)|interested|i'?m in|book|schedule|set (it|something) up|works for me|happy to)\b/i;
const SCHEDULING = /\b(monday|tuesday|wednesday|thursday|friday|tomorrow|next week|this week|morning|afternoon|\b\d{1,2}\s?(am|pm)\b|available|free (on|at)|what times)\b/i;
const NEGATIVE = /\b(not interested|no thanks|no thank you|not (right )?now|already (have|found|went with)|pass|unsubscribe|not a (good )?fit)\b/i;
const QUESTION = /\?|\b(how|what|when|where|why|can you|could you|would you|do you)\b/i;

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

export function classifyReplyIntent(raw: string): ReplyAssessment {
  const text = (raw ?? "").trim();
  const lower = text.toLowerCase();

  if (HOSTILE.test(lower) || PROFANITY.test(lower)) {
    return { intent: "hostile", confidence: 0.9, needsHuman: true, reason: "hostile / complaint language — handle personally, do not auto-reply" };
  }
  // Unverifiable questions (price, contract, exact logistics) must never be
  // answered by the agent on its own — that's how brands get burned.
  if (UNVERIFIABLE.test(lower)) {
    return { intent: "question", confidence: 0.55, needsHuman: true, reason: "asks something the agent can't verify (price/terms/logistics) — answer it yourself" };
  }
  // Very short / low-signal replies are ambiguous — don't read intent into them.
  if (wordCount(text) <= 2 && !POSITIVE.test(lower) && !NEGATIVE.test(lower)) {
    return { intent: "ambiguous", confidence: 0.4, needsHuman: true, reason: "too short to read intent — a holding reply is safer than a guess" };
  }
  if (NEGATIVE.test(lower)) {
    // Conservative: a soft "no/not now" is NOT a hard disqualification — keep nurturing.
    return { intent: "negative", confidence: 0.7, needsHuman: false, reason: "soft decline — keep the door open, don't hard-disqualify" };
  }
  if (POSITIVE.test(lower) && (SCHEDULING.test(lower) || wordCount(text) <= 12)) {
    return { intent: "positive", confidence: 0.85, needsHuman: false, reason: "clear positive — move toward a booked time" };
  }
  if (SCHEDULING.test(lower)) {
    return { intent: "scheduling", confidence: 0.8, needsHuman: false, reason: "proposing/asking about times — offer concrete slots" };
  }
  if (QUESTION.test(lower)) {
    // A general question we MIGHT be able to answer, but flag for a careful look.
    return { intent: "question", confidence: 0.6, needsHuman: true, reason: "a question — review the drafted answer before it sends" };
  }
  return { intent: "ambiguous", confidence: 0.5, needsHuman: true, reason: "couldn't confidently read intent — review before sending" };
}
