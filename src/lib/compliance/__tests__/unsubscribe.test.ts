import { describe, it, expect } from "vitest";
import { makeUnsubscribeToken, verifyUnsubscribeToken, unsubscribeUrl } from "@/lib/compliance/unsubscribe";
import { complianceFooter, withComplianceFooter } from "@/lib/compliance";

describe("unsubscribe tokens", () => {
  it("round-trips a valid token", () => {
    const tok = makeUnsubscribeToken("org_123", "Lead@Example.com");
    const decoded = verifyUnsubscribeToken(tok);
    expect(decoded).toEqual({ orgId: "org_123", email: "lead@example.com" });
  });

  it("rejects a tampered token", () => {
    const tok = makeUnsubscribeToken("org_123", "a@b.com");
    const tampered = tok.slice(0, -3) + "xyz";
    expect(verifyUnsubscribeToken(tampered)).toBeNull();
    expect(verifyUnsubscribeToken("garbage")).toBeNull();
  });

  it("builds an absolute unsubscribe URL", () => {
    expect(unsubscribeUrl("o", "a@b.com")).toMatch(/\/u\/.+\..+/);
  });
});

describe("CAN-SPAM footer", () => {
  const footer = complianceFooter({ orgId: "o", email: "a@b.com", mailingAddress: "1 Main St, Austin TX", brand: "Acme" });

  it("includes unsubscribe link + physical address", () => {
    expect(footer).toContain("Unsubscribe instantly:");
    expect(footer).toContain("1 Main St, Austin TX");
    expect(footer).toContain("Acme");
  });

  it("appends idempotently", () => {
    const body = "Hi there.";
    const once = withComplianceFooter(body, footer);
    const twice = withComplianceFooter(once, footer);
    expect(once).toContain("Unsubscribe instantly:");
    expect(twice).toBe(once); // does not double-append
  });
});
