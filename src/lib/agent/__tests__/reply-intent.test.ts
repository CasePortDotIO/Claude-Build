import { describe, it, expect } from "vitest";
import { classifyReplyIntent } from "@/lib/agent/reply-intent";
import { StubProvider } from "@/lib/ai/provider";
import { defaultVoiceProfile } from "@/lib/agent/voice";
import { buildOptOutLine } from "@/lib/agent/draft";

describe("§5 reply confidence gate", () => {
  it("routes hostile replies to a human", () => {
    const a = classifyReplyIntent("Who are you and how did you get my email? This is spam.");
    expect(a.intent).toBe("hostile");
    expect(a.needsHuman).toBe(true);
  });

  it("never auto-answers unverifiable questions (price/terms)", () => {
    for (const q of ["How much does this cost?", "What's your pricing?", "Is there a refund or contract?"]) {
      const a = classifyReplyIntent(q);
      expect(a.needsHuman).toBe(true);
      expect(a.reason).toMatch(/verify|price|terms|logistics/i);
    }
  });

  it("treats a 1–2 word reply as ambiguous, not a signal", () => {
    expect(classifyReplyIntent("ok").needsHuman).toBe(true);
    expect(classifyReplyIntent("hmm").intent).toBe("ambiguous");
  });

  it("reads a clear positive confidently and keeps it in-flow", () => {
    const a = classifyReplyIntent("Yes! I'm interested, let's chat this week.");
    expect(a.intent).toBe("positive");
    expect(a.needsHuman).toBe(false);
    expect(a.confidence).toBeGreaterThan(0.7);
  });

  it("does NOT hard-disqualify a soft no — keeps nurturing", () => {
    const a = classifyReplyIntent("Not right now, maybe later.");
    expect(a.intent).toBe("negative");
    expect(a.needsHuman).toBe(false);
    expect(a.reason).toMatch(/don'?t hard-disqualify|keep the door open/i);
  });

  it("stub provider returns a safe holding reply when holdForReview is set", async () => {
    const res = await new StubProvider().draftReply({
      lead: { firstName: "Sam", company: null, originalInquiry: null, statedGoal: null, toneRead: null, objections: [] },
      voice: defaultVoiceProfile(),
      operatorName: "Jess",
      optOutLine: buildOptOutLine(),
      thread: [],
      theirReply: "What does it cost?",
      availability: [],
      variantCount: 1,
      holdForReview: true,
    });
    expect(res.variants).toHaveLength(1);
    expect(res.variants[0].angle).toBe("holding");
    // It must NOT fabricate a price or a specific commitment.
    expect(res.variants[0].body).not.toMatch(/\$|\bprice\b|\bcosts?\b/i);
    expect(res.variants[0].body.toLowerCase()).toContain("follow up");
  });
});
