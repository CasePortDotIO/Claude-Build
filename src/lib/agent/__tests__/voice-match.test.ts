import { describe, it, expect } from "vitest";
import { computeVoiceFidelity, longestSharedPhrase } from "@/lib/agent/voice-match";
import { defaultVoiceProfile } from "@/lib/agent/voice";

describe("voice fidelity (M9)", () => {
  const voice = defaultVoiceProfile();

  it("finds a real ≥4-word phrase echoed from a past email", () => {
    const sample = "Hey there, I wanted to check in and see how your launch is going this month.";
    const body = "Hi Dana,\n\nI wanted to check in and see how things are going.\n\n— Jess";
    const echo = longestSharedPhrase(body, sample);
    expect(echo).toBeTruthy();
    expect(echo!.toLowerCase()).toContain("wanted to check in");
  });

  it("returns null when there is no meaningful overlap", () => {
    expect(longestSharedPhrase("Completely different words here entirely", "nothing alike at all friend")).toBeNull();
  });

  it("does not count an all-stopword run as an echo", () => {
    // Shared run is only stop-words ("to the of and") — must be rejected.
    const echo = longestSharedPhrase("send it to the of and now", "give to the of and later");
    expect(echo).toBeNull();
  });

  it("scores a voice-aligned draft higher than a misaligned one", () => {
    const sample = "Hi there, quick question — are you still working toward your goal? Happy to help.";
    const aligned = computeVoiceFidelity({
      body: "Hi Dana,\n\nQuick question — are you still working toward your goal?\n\n— Jess",
      voice,
      voiceSamples: [sample],
      confidence: 0.84,
    });
    const misaligned = computeVoiceFidelity({
      body: "GREETINGS VALUED PROSPECT. Pursuant to our previous correspondence regarding the aforementioned matter, I am compelled to inform you of an unprecedented and frankly unmissable commercial opportunity that demands your immediate attention.",
      voice,
      voiceSamples: [sample],
      confidence: 0.5,
    });
    expect(aligned.match).toBeGreaterThan(misaligned.match);
    expect(aligned.echo).toBeTruthy();
  });

  it("keeps the score within a believable bounded range", () => {
    const f = computeVoiceFidelity({ body: "x", voice, voiceSamples: [], confidence: 1 });
    expect(f.match).toBeGreaterThanOrEqual(0.62);
    expect(f.match).toBeLessThanOrEqual(0.98);
    expect(f.echo).toBeNull();
  });
});
