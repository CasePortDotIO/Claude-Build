import { describe, it, expect } from "vitest";
import { normalizeLeads } from "@/lib/leadsource/types";
import { sampleLeadsFor } from "@/lib/leadsource/sample";
import { getLeadSource, LEAD_SOURCE_META } from "@/lib/leadsource";
import { HubSpotLeadSource } from "@/lib/leadsource/providers";

describe("lead source normalization", () => {
  it("trims, lowercases email, and drops invalid/duplicate rows", () => {
    const out = normalizeLeads([
      { email: " A@B.com ", firstName: " Ann " },
      { email: "a@b.com", firstName: "Dup" }, // duplicate (lowercased)
      { email: "bad-email", firstName: "No" }, // invalid
      { email: "c@d.com" },
    ]);
    expect(out.map((l) => l.email)).toEqual(["a@b.com", "c@d.com"]);
    expect(out[0].firstName).toBe("Ann");
  });
});

describe("sample sources", () => {
  it("returns demo contacts for each provider", () => {
    for (const p of ["HUBSPOT", "GOOGLE_SHEETS", "MAILCHIMP", "KAJABI"] as const) {
      const leads = sampleLeadsFor(p);
      expect(leads.length).toBeGreaterThan(0);
      expect(leads.every((l) => l.email.includes("@example.com"))).toBe(true);
    }
  });
});

describe("provider factory + liveness", () => {
  it("routes each kind to an adapter (CSV has none)", () => {
    expect(getLeadSource("HUBSPOT")?.kind).toBe("HUBSPOT");
    expect(getLeadSource("MAILCHIMP")?.kind).toBe("MAILCHIMP");
    expect(getLeadSource("CSV")).toBeNull();
  });

  it("is not live without an API key", () => {
    expect(new HubSpotLeadSource().isLive({})).toBe(false);
    expect(new HubSpotLeadSource().isLive({ apiKey: "tok" })).toBe(true);
  });

  it("exposes display metadata for the UI", () => {
    expect(LEAD_SOURCE_META.HUBSPOT.name).toBe("HubSpot");
    expect(LEAD_SOURCE_META.MAILCHIMP.needs).toMatch(/list id/i);
  });
});
