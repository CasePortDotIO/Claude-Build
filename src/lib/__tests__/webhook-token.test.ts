import { describe, it, expect } from "vitest";
import { makeWebhookToken, verifyWebhookToken, calcomWebhookUrl } from "@/lib/webhook-token";

describe("per-org webhook token", () => {
  it("round-trips and binds to the org", () => {
    const tok = makeWebhookToken("org_abc");
    expect(verifyWebhookToken(tok)).toBe("org_abc");
  });

  it("rejects tampered / missing tokens (no cross-tenant)", () => {
    const tok = makeWebhookToken("org_abc");
    expect(verifyWebhookToken(tok.slice(0, -2) + "zz")).toBeNull();
    expect(verifyWebhookToken("garbage")).toBeNull();
    expect(verifyWebhookToken(null)).toBeNull();
    // A token forged for a different org id won't validate without the secret.
    const [payload] = tok.split(".");
    expect(verifyWebhookToken(`${payload}.deadbeef`)).toBeNull();
  });

  it("builds an absolute webhook URL carrying the token", () => {
    expect(calcomWebhookUrl("org_abc")).toMatch(/\/api\/webhooks\/calcom\?t=.+\..+/);
  });
});
