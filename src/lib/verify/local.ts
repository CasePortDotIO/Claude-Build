import { resolveMx } from "node:dns/promises";
import type { EmailVerifier, VerifyVerdict, Reachability } from "@/lib/verify/types";

/**
 * The default, no-vendor verifier (§3). Does everything achievable without a
 * paid API: strict syntax, role-account detection, disposable-domain detection,
 * and a live MX-record lookup (the single highest-signal cheap check — a domain
 * with no MX cannot receive mail, period).
 *
 * Failure philosophy: be conservative about INVALID. Only mark INVALID when we
 * are certain (bad syntax, or the domain resolves but has no MX). If the DNS
 * lookup itself fails/timems out we do NOT condemn the address — we mark it
 * RISKY so it's held out of warmup but not destroyed. False positives on INVALID
 * would silently delete reachable leads, which is worse than a held-back RISKY.
 *
 * The MX resolver is injectable so this is unit-testable without real DNS.
 */

// Pragmatic RFC-5321-ish syntax: one @, a dotted domain, no spaces/quotes.
const SYNTAX = /^[^\s@"]+@[^\s@.]+(\.[^\s@.]+)+$/;

const ROLE_LOCALS = new Set([
  "info", "sales", "admin", "support", "help", "contact", "office", "billing",
  "noreply", "no-reply", "donotreply", "do-not-reply", "postmaster", "abuse",
  "hello", "team", "marketing", "hr", "jobs", "careers", "webmaster", "mailer-daemon",
]);

// A small, well-known disposable-domain set. Extendable; the vendor verifier
// would cover the long tail.
const DISPOSABLE = new Set([
  "mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com",
  "trashmail.com", "yopmail.com", "getnada.com", "throwawaymail.com", "sharklasers.com",
]);

export type MxResolver = (domain: string) => Promise<boolean>;

/** Default MX check: true if the domain advertises at least one MX host. */
const defaultMxResolver: MxResolver = async (domain) => {
  try {
    const records = await withTimeout(resolveMx(domain), 4000);
    return Array.isArray(records) && records.length > 0;
  } catch (e) {
    // ENOTFOUND / NXDOMAIN → the domain truly has no MX (treat as definitive).
    // Any other error (timeout, SERVFAIL, network) → unknown, rethrow so the
    // caller can choose RISKY rather than INVALID.
    const code = (e as { code?: string }).code;
    if (code === "ENOTFOUND" || code === "ENODATA" || code === "NXDOMAIN") return false;
    throw e;
  }
};

export class LocalVerifier implements EmailVerifier {
  readonly name = "local";
  constructor(private mx: MxResolver = defaultMxResolver) {}

  async verify(emails: string[]): Promise<VerifyVerdict[]> {
    // Resolve MX once per domain, not once per address.
    const domains = new Set<string>();
    for (const e of emails) {
      const d = domainOf(e);
      if (d) domains.add(d);
    }
    const mxByDomain = new Map<string, "yes" | "no" | "unknown">();
    await Promise.all(
      [...domains].map(async (d) => {
        if (DISPOSABLE.has(d)) {
          mxByDomain.set(d, "yes"); // disposable handled separately as RISKY
          return;
        }
        try {
          mxByDomain.set(d, (await this.mx(d)) ? "yes" : "no");
        } catch {
          mxByDomain.set(d, "unknown");
        }
      }),
    );

    return emails.map((raw) => classify(raw, mxByDomain));
  }
}

function classify(raw: string, mxByDomain: Map<string, "yes" | "no" | "unknown">): VerifyVerdict {
  const email = raw.trim().toLowerCase();
  if (!SYNTAX.test(email)) return verdict(email, "INVALID", "malformed address");

  const domain = domainOf(email)!;
  const local = email.slice(0, email.indexOf("@"));

  const mx = mxByDomain.get(domain);
  if (mx === "no") return verdict(email, "INVALID", "domain has no MX record");

  if (DISPOSABLE.has(domain)) return verdict(email, "RISKY", "disposable / throwaway domain");
  if (ROLE_LOCALS.has(local)) return verdict(email, "RISKY", "role account (low-value, high-complaint)");
  if (mx === "unknown") return verdict(email, "RISKY", "MX could not be confirmed");

  return verdict(email, "REACHABLE", "ok");
}

function verdict(email: string, status: Reachability, reason: string): VerifyVerdict {
  return { email, status, reason };
}

function domainOf(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  return email.slice(at + 1).toLowerCase();
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(Object.assign(new Error("dns timeout"), { code: "ETIMEOUT" })), ms)),
  ]);
}
