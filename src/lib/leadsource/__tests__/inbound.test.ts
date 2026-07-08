import { describe, it, expect } from "vitest";
import { parseInboundLead } from "@/lib/leadsource/inbound";

describe("inbound lead parser", () => {
  it("maps common field aliases and normalizes the email", () => {
    const lead = parseInboundLead({
      Email: "  Dana@Example.com ",
      first_name: "Dana",
      "last name": "Lee", // not an alias — ignored
      company: "Acme",
      phone_number: "555-1212",
      message: "asked about Q4 coaching",
    });
    expect(lead).not.toBeNull();
    expect(lead!.email).toBe("dana@example.com");
    expect(lead!.firstName).toBe("Dana");
    expect(lead!.company).toBe("Acme");
    expect(lead!.phone).toBe("555-1212");
    expect(lead!.originalInquiry).toBe("asked about Q4 coaching");
  });

  it("rejects a body with no usable email", () => {
    expect(parseInboundLead({ firstName: "NoEmail" })).toBeNull();
    expect(parseInboundLead({ email: "not-an-email" })).toBeNull();
    expect(parseInboundLead({ email: "" })).toBeNull();
    expect(parseInboundLead(null)).toBeNull();
    expect(parseInboundLead("nope")).toBeNull();
  });

  it("accepts a numeric phone and lowercases email", () => {
    const lead = parseInboundLead({ email: "A@B.CO", phone: 5551234 });
    expect(lead!.email).toBe("a@b.co");
    expect(lead!.phone).toBe("5551234");
  });
});
