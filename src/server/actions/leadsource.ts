"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOrg } from "@/lib/auth-helpers";
import { encryptSecret } from "@/lib/crypto";
import { pullFromSource } from "@/lib/leadsource";
import { ingestLeads } from "@/lib/import/ingest";
import type { LeadSourceKind } from "@prisma/client";

export interface LeadSourceActionResult {
  ok: boolean;
  error?: string;
  message?: string;
  imported?: number;
}

const VALID: LeadSourceKind[] = ["HUBSPOT", "GOOGLE_SHEETS", "MAILCHIMP", "KAJABI"];

/**
 * Connect a lead source. The API key is encrypted at rest; `config` carries
 * provider-specific settings (sheet id, list id, subdomain). With no key it
 * connects in "sample" mode so the import flow is demoable offline.
 */
export async function connectLeadSourceAction(opts: {
  provider: LeadSourceKind;
  apiKey?: string;
  config?: Record<string, string>;
}): Promise<LeadSourceActionResult> {
  const ctx = await requireOrg();
  if (!VALID.includes(opts.provider)) return { ok: false, error: "Unknown source." };

  await prisma.leadSourceConnection.upsert({
    where: { orgId_provider: { orgId: ctx.orgId, provider: opts.provider } },
    create: {
      orgId: ctx.orgId,
      provider: opts.provider,
      status: "CONNECTED",
      apiKeyEnc: opts.apiKey ? encryptSecret(opts.apiKey) : null,
      config: opts.config ?? {},
    },
    update: {
      status: "CONNECTED",
      apiKeyEnc: opts.apiKey ? encryptSecret(opts.apiKey) : undefined,
      config: opts.config ?? undefined,
    },
  });
  revalidatePath("/connections");
  return { ok: true, message: `Connected ${opts.provider.replace("_", " ").toLowerCase()}.` };
}

export async function disconnectLeadSourceAction(provider: LeadSourceKind): Promise<LeadSourceActionResult> {
  const ctx = await requireOrg();
  await prisma.leadSourceConnection.updateMany({ where: { orgId: ctx.orgId, provider }, data: { status: "DISCONNECTED" } });
  revalidatePath("/connections");
  return { ok: true, message: "Disconnected." };
}

/**
 * Import leads from a connected source. Pulls via the LeadSource adapter (live
 * API if keyed, else deterministic samples), then runs the SAME ingest pipeline
 * as CSV — prior-contact gate, suppression/dup filtering, audit. The operator
 * still attests prior contact (this is reactivation, not cold scraping).
 */
export async function importFromSourceAction(opts: {
  provider: LeadSourceKind;
  priorContactAttested: boolean;
}): Promise<LeadSourceActionResult> {
  const ctx = await requireOrg();
  const conn = await prisma.leadSourceConnection.findFirst({
    where: { orgId: ctx.orgId, provider: opts.provider, status: "CONNECTED" },
  });
  if (!conn) return { ok: false, error: "Connect this source first." };

  const { leads, live } = await pullFromSource(conn);
  if (leads.length === 0) {
    return { ok: false, error: live ? "No contacts returned from the source." : "No sample contacts for this source." };
  }

  const res = await ingestLeads(leads, {
    orgId: ctx.orgId,
    actorId: ctx.userId,
    name: `${prettyName(opts.provider)} import${live ? "" : " (sample)"}`,
    source: opts.provider.toLowerCase(),
    consentBasis: "PRIOR_INQUIRY",
    priorContactAttested: opts.priorContactAttested,
  });
  if (!res.ok) return { ok: false, error: res.error };

  await prisma.leadSourceConnection.update({
    where: { id: conn.id },
    data: { lastSyncAt: new Date(), lastImported: res.imported },
  });

  revalidatePath("/connections");
  revalidatePath("/leads");
  revalidatePath("/");
  return {
    ok: true,
    imported: res.imported,
    message: `Imported ${res.imported} from ${prettyName(opts.provider)}${live ? "" : " (sample data)"}; ${res.duplicatesInDb} dup, ${res.suppressed} suppressed.`,
  };
}

function prettyName(p: LeadSourceKind): string {
  return { HUBSPOT: "HubSpot", GOOGLE_SHEETS: "Google Sheets", MAILCHIMP: "Mailchimp", KAJABI: "Kajabi", CSV: "CSV" }[p];
}
