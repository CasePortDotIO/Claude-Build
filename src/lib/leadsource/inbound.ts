import type { MappedLead } from "@/lib/import/mapping";

/**
 * Normalize an inbound-webhook JSON body into a MappedLead. Accepts the common
 * field aliases a form / CRM might POST (email/e-mail, first_name/firstName, …)
 * so integrators don't have to match our exact keys. Returns null if there's no
 * usable email — a lead we can't contact isn't a lead.
 */
export function parseInboundLead(body: unknown): MappedLead | null {
  if (!body || typeof body !== "object") return null;
  // Case-insensitive key lookup so First_Name / FIRSTNAME / firstname all match.
  const b: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) b[k.toLowerCase()] = v;
  const pick = (...keys: string[]): string | undefined => {
    for (const k of keys) {
      const v = b[k.toLowerCase()];
      if (typeof v === "string" && v.trim()) return v.trim();
      if (typeof v === "number") return String(v);
    }
    return undefined;
  };

  const email = pick("email", "e-mail", "emailAddress", "email_address")?.toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return null;

  return {
    email,
    firstName: pick("firstName", "first_name", "first", "fname"),
    lastName: pick("lastName", "last_name", "last", "lname", "surname"),
    company: pick("company", "organization", "organisation", "business"),
    phone: pick("phone", "phoneNumber", "phone_number", "mobile", "tel"),
    originalInquiry: pick("originalInquiry", "inquiry", "enquiry", "message", "notes", "interest"),
    statedGoal: pick("statedGoal", "goal", "objective"),
    region: pick("region", "country", "location", "state"),
  };
}
