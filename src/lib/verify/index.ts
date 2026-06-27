import type { EmailVerifier } from "@/lib/verify/types";
import { LocalVerifier } from "@/lib/verify/local";

export * from "@/lib/verify/types";

/**
 * Verifier factory (§3). Swappable by design — a paid verification API (e.g.
 * ZeroBounce/NeverBounce/Bouncer) drops in behind EmailVerifier without any
 * change to ingest. We never hard-wire a single vendor; the default is the
 * no-network-dependency LocalVerifier (syntax + role + MX).
 *
 * To add a vendor: implement EmailVerifier, then branch on EMAIL_VERIFIER here.
 */
let cached: EmailVerifier | null = null;

export function getEmailVerifier(): EmailVerifier {
  if (cached) return cached;
  // const vendor = process.env.EMAIL_VERIFIER; // e.g. "zerobounce"
  // if (vendor === "zerobounce" && process.env.ZEROBOUNCE_API_KEY) cached = new ZeroBounceVerifier();
  cached = new LocalVerifier();
  return cached;
}

export function __setEmailVerifier(v: EmailVerifier | null) {
  cached = v;
}
