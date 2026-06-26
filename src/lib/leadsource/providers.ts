import type { LeadSource, LeadSourceContext, RawLead } from "@/lib/leadsource/types";
import { normalizeLeads } from "@/lib/leadsource/types";

/**
 * Real LeadSource adapters. Each pulls prior-contact leads from its API and
 * normalizes them; the ingest pipeline applies the prior-contact gate +
 * suppression/dup filtering downstream. Credentials are decrypted by the caller.
 */

// ── HubSpot (CRM contacts) ───────────────────────────────────────────────────
export class HubSpotLeadSource implements LeadSource {
  readonly kind = "HUBSPOT" as const;
  isLive(ctx: LeadSourceContext) {
    return Boolean(ctx.apiKey);
  }
  async fetchLeads(ctx: LeadSourceContext): Promise<RawLead[]> {
    const props = ["email", "firstname", "lastname", "company", "phone", "hs_lead_status"];
    const url = `https://api.hubapi.com/crm/v3/objects/contacts?limit=100&properties=${props.join(",")}`;
    const res = await fetch(url, { headers: { authorization: `Bearer ${ctx.apiKey}` } });
    if (!res.ok) throw new Error(`HubSpot fetch failed: ${res.status}`);
    const json = (await res.json()) as { results?: { properties: Record<string, string> }[] };
    return normalizeLeads(
      (json.results ?? []).map((r) => ({
        email: r.properties.email,
        firstName: r.properties.firstname,
        lastName: r.properties.lastname,
        company: r.properties.company,
        phone: r.properties.phone,
        originalInquiry: r.properties.hs_lead_status,
      })),
    );
  }
}

// ── Google Sheets (a sheet of leads) ─────────────────────────────────────────
export class GoogleSheetsLeadSource implements LeadSource {
  readonly kind = "GOOGLE_SHEETS" as const;
  isLive(ctx: LeadSourceContext) {
    return Boolean(ctx.apiKey && ctx.config?.sheetId);
  }
  async fetchLeads(ctx: LeadSourceContext): Promise<RawLead[]> {
    const sheetId = String(ctx.config?.sheetId ?? "");
    const range = String(ctx.config?.range ?? "A1:Z1000");
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?key=${ctx.apiKey}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Sheets fetch failed: ${res.status}`);
    const json = (await res.json()) as { values?: string[][] };
    const rows = json.values ?? [];
    if (rows.length < 2) return [];
    const headers = rows[0].map((h) => h.toLowerCase().trim());
    const idx = (names: string[]) => headers.findIndex((h) => names.includes(h));
    const ei = idx(["email", "e-mail"]);
    const fi = idx(["first name", "firstname", "first"]);
    const li = idx(["last name", "lastname", "last"]);
    const ci = idx(["company", "organization"]);
    const ni = idx(["notes", "inquiry", "interest"]);
    return normalizeLeads(
      rows.slice(1).map((r) => ({
        email: ei >= 0 ? r[ei] : "",
        firstName: fi >= 0 ? r[fi] : undefined,
        lastName: li >= 0 ? r[li] : undefined,
        company: ci >= 0 ? r[ci] : undefined,
        originalInquiry: ni >= 0 ? r[ni] : undefined,
      })),
    );
  }
}

// ── Mailchimp (audience members) ─────────────────────────────────────────────
export class MailchimpLeadSource implements LeadSource {
  readonly kind = "MAILCHIMP" as const;
  isLive(ctx: LeadSourceContext) {
    return Boolean(ctx.apiKey && ctx.config?.listId);
  }
  async fetchLeads(ctx: LeadSourceContext): Promise<RawLead[]> {
    const dc = String(ctx.config?.dc ?? (ctx.apiKey ?? "").split("-")[1] ?? "us1");
    const listId = String(ctx.config?.listId ?? "");
    const url = `https://${dc}.api.mailchimp.com/3.0/lists/${listId}/members?count=200&status=subscribed`;
    const auth = Buffer.from(`anystring:${ctx.apiKey}`).toString("base64");
    const res = await fetch(url, { headers: { authorization: `Basic ${auth}` } });
    if (!res.ok) throw new Error(`Mailchimp fetch failed: ${res.status}`);
    const json = (await res.json()) as { members?: { email_address: string; merge_fields?: Record<string, string> }[] };
    return normalizeLeads(
      (json.members ?? []).map((m) => ({
        email: m.email_address,
        firstName: m.merge_fields?.FNAME,
        lastName: m.merge_fields?.LNAME,
        phone: m.merge_fields?.PHONE,
      })),
    );
  }
}

// ── Kajabi (members / contacts) ──────────────────────────────────────────────
export class KajabiLeadSource implements LeadSource {
  readonly kind = "KAJABI" as const;
  isLive(ctx: LeadSourceContext) {
    return Boolean(ctx.apiKey && ctx.config?.subdomain);
  }
  async fetchLeads(ctx: LeadSourceContext): Promise<RawLead[]> {
    const subdomain = String(ctx.config?.subdomain ?? "");
    const url = `https://${subdomain}.mykajabi.com/api/contacts?per_page=100`;
    const res = await fetch(url, { headers: { authorization: `Bearer ${ctx.apiKey}` } });
    if (!res.ok) throw new Error(`Kajabi fetch failed: ${res.status}`);
    const json = (await res.json()) as { contacts?: { email: string; first_name?: string; last_name?: string }[] };
    return normalizeLeads(
      (json.contacts ?? []).map((c) => ({ email: c.email, firstName: c.first_name, lastName: c.last_name })),
    );
  }
}
