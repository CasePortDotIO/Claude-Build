import type { LeadSourceConnection, LeadSourceKind } from "@prisma/client";
import type { LeadSource, LeadSourceContext, RawLead } from "@/lib/leadsource/types";
import { HubSpotLeadSource, GoogleSheetsLeadSource, MailchimpLeadSource, KajabiLeadSource } from "@/lib/leadsource/providers";
import { sampleLeadsFor } from "@/lib/leadsource/sample";
import { decryptSecret } from "@/lib/crypto";

export * from "@/lib/leadsource/types";

export function getLeadSource(kind: LeadSourceKind): LeadSource | null {
  switch (kind) {
    case "HUBSPOT":
      return new HubSpotLeadSource();
    case "GOOGLE_SHEETS":
      return new GoogleSheetsLeadSource();
    case "MAILCHIMP":
      return new MailchimpLeadSource();
    case "KAJABI":
      return new KajabiLeadSource();
    case "CSV":
      return null; // CSV is handled by the upload flow, not a fetch source
  }
}

export function leadSourceContext(conn: LeadSourceConnection): LeadSourceContext {
  return {
    apiKey: conn.apiKeyEnc ? decryptSecret(conn.apiKeyEnc) : undefined,
    config: (conn.config as Record<string, unknown>) ?? {},
  };
}

/**
 * Pull leads from a connected source. Uses the live API when credentials are
 * present, else falls back to deterministic sample contacts so the flow is
 * demoable offline. Returns the raw (normalized) leads + whether they were live.
 */
export async function pullFromSource(conn: LeadSourceConnection): Promise<{ leads: RawLead[]; live: boolean }> {
  const source = getLeadSource(conn.provider);
  if (!source) return { leads: [], live: false };
  const ctx = leadSourceContext(conn);
  if (source.isLive(ctx)) {
    return { leads: await source.fetchLeads(ctx), live: true };
  }
  return { leads: sampleLeadsFor(conn.provider), live: false };
}

export const LEAD_SOURCE_META: Record<Exclude<LeadSourceKind, "CSV">, { name: string; mono: string; color: string; needs: string }> = {
  HUBSPOT: { name: "HubSpot", mono: "HS", color: "#ff7a59", needs: "private app token" },
  GOOGLE_SHEETS: { name: "Google Sheets", mono: "GS", color: "#0f9d58", needs: "API key + sheet id" },
  MAILCHIMP: { name: "Mailchimp", mono: "MC", color: "#2c9ab7", needs: "API key + list id" },
  KAJABI: { name: "Kajabi", mono: "KJ", color: "#0d6efd", needs: "API key + subdomain" },
};
