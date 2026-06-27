import { describe, it, expect } from "vitest";
import { LocalVerifier, type MxResolver } from "@/lib/verify/local";

// Deterministic MX resolver: only these domains "have" MX. example.com is the
// canonical reserved domain with no mail service.
const fakeMx: MxResolver = async (domain) => ["good.com", "monroe.coach", "apexfit.co"].includes(domain);

describe("LocalVerifier (§3 list hygiene)", () => {
  const v = new LocalVerifier(fakeMx);

  it("marks malformed addresses INVALID", async () => {
    const [a, b, c] = await v.verify(["not-an-email", "missing@domain", "two@@at.com"]);
    expect(a.status).toBe("INVALID");
    expect(b.status).toBe("INVALID"); // no dotted TLD
    expect(c.status).toBe("INVALID");
  });

  it("marks addresses on a domain with no MX INVALID", async () => {
    const [r] = await v.verify(["real.person@example.com"]);
    expect(r.status).toBe("INVALID");
    expect(r.reason).toMatch(/MX/i);
  });

  it("flags role accounts as RISKY, not sendable-clean", async () => {
    for (const local of ["info", "sales", "noreply", "admin", "support"]) {
      const [r] = await v.verify([`${local}@good.com`]);
      expect(r.status).toBe("RISKY");
      expect(r.reason).toMatch(/role account/i);
    }
  });

  it("flags disposable domains as RISKY", async () => {
    const [r] = await v.verify(["someone@mailinator.com"]);
    expect(r.status).toBe("RISKY");
  });

  it("passes a clean personal address on a real MX domain as REACHABLE", async () => {
    const [r] = await v.verify(["jane.doe@good.com"]);
    expect(r.status).toBe("REACHABLE");
  });

  it("does NOT condemn an address when DNS is unknown — RISKY, never INVALID", async () => {
    const flaky: MxResolver = async () => {
      throw Object.assign(new Error("servfail"), { code: "ESERVFAIL" });
    };
    const [r] = await new LocalVerifier(flaky).verify(["jane@some-real-domain.com"]);
    expect(r.status).toBe("RISKY");
    expect(r.reason).toMatch(/could not be confirmed/i);
  });

  it("resolves MX once per domain across a batch", async () => {
    const calls: string[] = [];
    const counting: MxResolver = async (d) => {
      calls.push(d);
      return d === "good.com";
    };
    await new LocalVerifier(counting).verify(["a@good.com", "b@good.com", "c@good.com"]);
    expect(calls.filter((d) => d === "good.com")).toHaveLength(1);
  });
});
