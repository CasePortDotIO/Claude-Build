import type { MappedLead } from "@/lib/import/mapping";

/**
 * The LeadSource adapter interface (§6). Every importer — CSV, HubSpot, Google
 * Sheets, Mailchimp, Kajabi — conforms to this and returns normalized leads,
 * which then flow through the SAME ingestLeads pipeline (prior-contact gate +
 * suppression/dup filtering + audit). New sources drop in without touching the
 * agent loop or the ingest guarantees.
 */

// Normalized lead shape; identical to the import mapping output.
export type RawLead = MappedLead;

export interface LeadSourceContext {
  apiKey?: string;
  config?: Record<string, unknown>;
}

export interface LeadSource {
  readonly kind: "CSV" | "HUBSPOT" | "GOOGLE_SHEETS" | "MAILCHIMP" | "KAJABI";
  // Whether a real fetch is possible (credentials present), vs sample-only.
  isLive(ctx: LeadSourceContext): boolean;
  // Pull prior-contact leads from the source.
  fetchLeads(ctx: LeadSourceContext): Promise<RawLead[]>;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Shared normalizer: trim, lowercase email, drop invalid/dupe within the batch.
export function normalizeLeads(rows: RawLead[]): RawLead[] {
  const seen = new Set<string>();
  const out: RawLead[] = [];
  for (const r of rows) {
    const email = (r.email ?? "").toLowerCase().trim();
    if (!EMAIL_RE.test(email) || seen.has(email)) continue;
    seen.add(email);
    out.push({
      email,
      firstName: clean(r.firstName),
      lastName: clean(r.lastName),
      company: clean(r.company),
      phone: clean(r.phone),
      originalInquiry: clean(r.originalInquiry),
      statedGoal: clean(r.statedGoal),
      region: clean(r.region),
    });
  }
  return out;
}

function clean(v?: string): string | undefined {
  const t = v?.trim();
  return t ? t : undefined;
}
