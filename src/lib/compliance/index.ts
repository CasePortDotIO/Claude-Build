import { prisma } from "@/lib/prisma";
import { unsubscribeUrl } from "@/lib/compliance/unsubscribe";
import type { LeadStatus } from "@prisma/client";

export * from "@/lib/compliance/unsubscribe";

export class ComplianceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ComplianceError";
  }
}

// Lead states from which outreach is never allowed (§9/§13).
const BLOCKED: ReadonlySet<LeadStatus> = new Set<LeadStatus>(["OPTED_OUT", "DO_NOT_CONTACT", "BOUNCED", "BOOKED"]);

/**
 * The single contactability gate. Every place that would email a lead — draft
 * and send — calls this so suppression + opt-out + DNC can never be bypassed,
 * even on an "autonomous" sequence. Throws ComplianceError when contact is
 * disallowed.
 */
export async function assertContactable(orgId: string, email: string, status: LeadStatus): Promise<void> {
  if (BLOCKED.has(status)) {
    throw new ComplianceError(`Lead is ${status} — contact is blocked by compliance rails.`);
  }
  const suppressed = await prisma.suppressionEntry.findUnique({
    where: { orgId_email: { orgId, email: email.toLowerCase() } },
  });
  if (suppressed) {
    throw new ComplianceError(`Lead is on the suppression list (${suppressed.reason}); contact is blocked.`);
  }
}

/**
 * CAN-SPAM footer appended to every outbound email at send time (§9):
 * a one-click unsubscribe link + the operator's real physical mailing address.
 * The per-message plain-text opt-out ("reply stop") is already in the body.
 */
export function complianceFooter(opts: { orgId: string; email: string; mailingAddress: string; brand: string }): string {
  const url = unsubscribeUrl(opts.orgId, opts.email);
  return [
    "",
    "—",
    `Unsubscribe instantly: ${url}`,
    `${opts.brand} · ${opts.mailingAddress}`,
    "You're receiving this because you previously contacted us.",
  ].join("\n");
}

// Add the footer to a body unless it's already present (idempotent on resend).
export function withComplianceFooter(body: string, footer: string): string {
  if (body.includes("Unsubscribe instantly:")) return body;
  return `${body.trimEnd()}\n${footer}`;
}
