import type { ConsentBasis } from "@prisma/client";

/**
 * The "is this a prior contact?" gate (§9, §13).
 *
 * The Warm Sweep is a *reactivation* tool, not a cold-spam cannon. Before any
 * import is written, the operator must attest that these leads have a prior
 * relationship/inquiry. This module is the single source of truth for that
 * rule so it can't be bypassed by a careless caller — the import action calls
 * `assertPriorContact` and refuses to proceed otherwise.
 */

export class PriorContactError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PriorContactError";
  }
}

export interface PriorContactAttestation {
  attested: boolean;
  consentBasis: ConsentBasis;
}

// Bases that, on their own, satisfy "prior relationship". UNKNOWN never does.
const ALLOWED_BASES: ConsentBasis[] = [
  "PRIOR_INQUIRY",
  "EXISTING_CUSTOMER",
  "EXPLICIT_CONSENT",
  "LEGITIMATE_INTEREST",
];

export function isPriorContactSatisfied(a: PriorContactAttestation): boolean {
  return a.attested === true && ALLOWED_BASES.includes(a.consentBasis);
}

export function assertPriorContact(a: PriorContactAttestation): void {
  if (!a.attested) {
    throw new PriorContactError(
      "Import blocked: you must confirm these leads previously inquired or have an existing relationship. The Warm Sweep only re-engages prior contacts.",
    );
  }
  if (!ALLOWED_BASES.includes(a.consentBasis)) {
    throw new PriorContactError(
      "Import blocked: a lawful basis for contact (prior inquiry, existing customer, explicit consent, or legitimate interest) is required.",
    );
  }
}
