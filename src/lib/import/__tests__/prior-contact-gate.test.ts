import { describe, it, expect } from "vitest";
import {
  assertPriorContact,
  isPriorContactSatisfied,
  PriorContactError,
} from "@/lib/import/prior-contact-gate";

describe("prior-contact gate", () => {
  it("passes when attested with a lawful basis", () => {
    expect(isPriorContactSatisfied({ attested: true, consentBasis: "PRIOR_INQUIRY" })).toBe(true);
    expect(() => assertPriorContact({ attested: true, consentBasis: "EXISTING_CUSTOMER" })).not.toThrow();
  });

  it("throws when not attested", () => {
    expect(() => assertPriorContact({ attested: false, consentBasis: "PRIOR_INQUIRY" })).toThrow(
      PriorContactError,
    );
  });

  it("throws when attested but basis is UNKNOWN", () => {
    expect(isPriorContactSatisfied({ attested: true, consentBasis: "UNKNOWN" })).toBe(false);
    expect(() => assertPriorContact({ attested: true, consentBasis: "UNKNOWN" })).toThrow(PriorContactError);
  });
});
