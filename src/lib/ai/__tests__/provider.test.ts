import { describe, it, expect } from "vitest";
import { StubProvider } from "@/lib/ai/provider";
import { defaultVoiceProfile } from "@/lib/agent/voice";
import { buildOptOutLine } from "@/lib/agent/draft";
import type { DraftInput } from "@/lib/ai/types";

const optOut = buildOptOutLine();

function input(overrides: Partial<DraftInput["lead"]> = {}, variantCount = 3): DraftInput {
  return {
    lead: {
      firstName: "Dana",
      company: null,
      originalInquiry: "pricing your coaching packages",
      statedGoal: "replacing your salary with coaching income",
      toneRead: "warm",
      objections: [],
      ...overrides,
    },
    voice: defaultVoiceProfile(),
    operatorName: "Jess",
    optOutLine: optOut,
    voiceSamples: [],
    similarObjections: [],
    variantCount,
  };
}

describe("StubProvider.draftReengagement", () => {
  it("returns the requested number of variants with valid confidence + opt-out", async () => {
    const res = await new StubProvider().draftReengagement(input());
    expect(res.variants).toHaveLength(3);
    for (const v of res.variants) {
      expect(v.confidence).toBeGreaterThanOrEqual(0);
      expect(v.confidence).toBeLessThanOrEqual(1);
      expect(v.subject.length).toBeGreaterThan(0);
      expect(v.body).toContain(optOut); // §5/§9: opt-out in every email
      expect(v.openingLine.length).toBeGreaterThan(0);
    }
  });

  it("grounds copy in real memory (uses the stated goal verbatim)", async () => {
    const res = await new StubProvider().draftReengagement(input());
    const goalLed = res.variants.find((v) => v.angle === "goal-led")!;
    expect(goalLed.body).toContain("replacing your salary with coaching income");
    expect(goalLed.body).toContain("Hi Dana,"); // greeting personalized from real name
  });

  it("never invents facts when memory is missing", async () => {
    // No goal, no inquiry, no name — must not fabricate any of them.
    const res = await new StubProvider().draftReengagement(
      input({ firstName: null, originalInquiry: null, statedGoal: null }),
    );
    for (const v of res.variants) {
      expect(v.body).not.toMatch(/replacing your salary|coaching packages/);
      expect(v.body).toContain("there"); // neutral greeting fallback, not a made-up name
    }
  });

  it("respects a 2-variant request", async () => {
    const res = await new StubProvider().draftReengagement(input({}, 2));
    expect(res.variants).toHaveLength(2);
  });
});

describe("StubProvider.learnVoice", () => {
  it("extracts a profile and detects short vs long sentences", async () => {
    const short = await new StubProvider().learnVoice({
      operatorName: "Jess",
      samples: [{ body: "Hi Dana. Loved it. Want this? Let me know." }],
    });
    expect(short.profile.sentenceLength).toMatch(/Short/);
    expect(short.profile.greeting).toContain("{{firstName}}");
  });
});
