import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { ingestLeads } from "@/lib/import/ingest";
import { __setEmailVerifier } from "@/lib/verify";
import type { EmailVerifier } from "@/lib/verify/types";

// A deterministic verifier so the gate is testable without DNS: classify by the
// local-part keyword in the address.
const stubVerifier: EmailVerifier = {
  name: "stub",
  async verify(emails) {
    return emails.map((email) => {
      const e = email.toLowerCase();
      if (e.startsWith("bad")) return { email: e, status: "INVALID" as const, reason: "no MX record" };
      if (e.startsWith("info") || e.startsWith("role")) return { email: e, status: "RISKY" as const, reason: "role account" };
      return { email: e, status: "REACHABLE" as const, reason: "ok" };
    });
  },
};

describe("ingest list-hygiene gate (§3)", () => {
  const tag = `hyg-${Math.random().toString(36).slice(2, 8)}`;
  let orgId: string;

  beforeAll(async () => {
    __setEmailVerifier(stubVerifier);
    const org = await prisma.org.create({ data: { name: `Org ${tag}`, slug: `org-${tag}`, type: "CLIENT" } });
    orgId = org.id;
  });

  afterAll(async () => {
    __setEmailVerifier(null);
    await prisma.org.delete({ where: { id: orgId } }).catch(() => {});
  });

  it("classifies a dirty list and never creates an INVALID lead", async () => {
    const res = await ingestLeads(
      [
        { email: `clean1-${tag}@reachable.com`, firstName: "A" },
        { email: `clean2-${tag}@reachable.com`, firstName: "B" },
        { email: `info-${tag}@reachable.com`, firstName: "Role" },
        { email: `bad-${tag}@nope.com`, firstName: "Dead" },
      ],
      { orgId, name: "dirty", source: "csv", consentBasis: "PRIOR_INQUIRY", priorContactAttested: true, totalRows: 4 },
    );

    expect(res.ok).toBe(true);
    expect(res.reachable).toBe(2);
    expect(res.risky).toBe(1);
    expect(res.invalid).toBe(1);
    expect(res.imported).toBe(3); // reachable + risky created; invalid not

    // The INVALID address is hard-suppressed and has no sendable lead.
    const invalidLead = await prisma.lead.findFirst({ where: { orgId, email: `bad-${tag}@nope.com` } });
    expect(invalidLead).toBeNull();
    const sup = await prisma.suppressionEntry.findUnique({
      where: { orgId_email: { orgId, email: `bad-${tag}@nope.com` } },
    });
    expect(sup?.reason).toBe("INVALID");

    // The role account is RISKY (kept, flagged).
    const role = await prisma.lead.findFirst({ where: { orgId, email: `info-${tag}@reachable.com` } });
    expect(role?.reachability).toBe("RISKY");
  });

  it("re-importing a now-suppressed invalid address drops it again", async () => {
    const res = await ingestLeads(
      [{ email: `bad-${tag}@nope.com`, firstName: "Dead again" }],
      { orgId, name: "retry", source: "csv", consentBasis: "PRIOR_INQUIRY", priorContactAttested: true, totalRows: 1 },
    );
    expect(res.imported).toBe(0);
    expect(res.suppressed).toBe(1); // caught by the suppression filter, never re-created
  });
});
