/**
 * Private-beta comps. Emails listed in TRIAL_COMP_EMAILS (comma-separated) are
 * granted a free trial on signup, so invited testers walk straight past the
 * paid-only paywall while everyone else still has to subscribe. Change the env
 * var to add/remove testers — no deploy, no DB surgery.
 */
export function compedTrialEmails(): Set<string> {
  return new Set(
    (process.env.TRIAL_COMP_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isCompedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return compedTrialEmails().has(email.trim().toLowerCase());
}
