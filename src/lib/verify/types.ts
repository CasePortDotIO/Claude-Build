// Pre-flight email verification (§3 list hygiene). Dead lists are the dirtiest,
// highest-bounce input there is; sending to them blindly is how the whole
// category burns deliverability. Every address is classified BEFORE it can be
// queued, behind a swappable interface so a third-party verifier can drop in
// without touching business logic.

export type Reachability = "REACHABLE" | "RISKY" | "INVALID";

export interface VerifyVerdict {
  email: string;
  status: Reachability;
  reason: string; // human-readable: "no MX record", "role account", "ok", …
}

export interface EmailVerifier {
  readonly name: string;
  /** Classify a batch of addresses. Order of results is not guaranteed; match by email. */
  verify(emails: string[]): Promise<VerifyVerdict[]>;
}
