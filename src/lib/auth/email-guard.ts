/**
 * Signup abuse guards. At public scale, disposable/throwaway signups are the
 * fastest way to rack up spam complaints and get the shared Google/Microsoft
 * OAuth app suspended — which would break sending for every tenant. Blocking
 * obvious throwaway domains at the door is cheap insurance.
 *
 * This is a curated list of the highest-volume disposable providers, not an
 * exhaustive one (that's a losing arms race). Extend via DISPOSABLE_EMAIL_DOMAINS
 * (comma-separated env) without a deploy.
 */
const BUILT_IN_DISPOSABLE = new Set([
  "mailinator.com",
  "guerrillamail.com",
  "guerrillamail.info",
  "sharklasers.com",
  "grr.la",
  "10minutemail.com",
  "10minutemail.net",
  "tempmail.com",
  "temp-mail.org",
  "tempmailo.com",
  "throwawaymail.com",
  "trashmail.com",
  "getnada.com",
  "nada.email",
  "maildrop.cc",
  "yopmail.com",
  "yopmail.fr",
  "dispostable.com",
  "fakeinbox.com",
  "mailnesia.com",
  "mohmal.com",
  "emailondeck.com",
  "spamgourmet.com",
  "mailcatch.com",
  "mintemail.com",
  "tempinbox.com",
  "burnermail.io",
  "spam4.me",
  "einrot.com",
  "moakt.com",
]);

function extraDisposable(): Set<string> {
  return new Set(
    (process.env.DISPOSABLE_EMAIL_DOMAINS ?? "")
      .split(",")
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isDisposableEmail(email: string): boolean {
  const domain = email.trim().toLowerCase().split("@")[1];
  if (!domain) return false;
  return BUILT_IN_DISPOSABLE.has(domain) || extraDisposable().has(domain);
}
