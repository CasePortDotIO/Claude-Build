/**
 * Platform superadmins — the operator(s) who run the whole product, distinct from
 * a workspace's CLIENT_ADMIN. Listed in SUPERADMIN_EMAILS (comma-separated), same
 * env-driven pattern as the beta comp list, so it changes with no deploy. Gates
 * the /admin area (go-live checklist, cross-org console).
 */
export function superadminEmails(): Set<string> {
  return new Set(
    (process.env.SUPERADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isSuperadmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return superadminEmails().has(email.trim().toLowerCase());
}
