"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/auth-helpers";
import { parseCsv } from "@/lib/import/csv";
import { applyMapping } from "@/lib/import/mapping";
import { ingestLeads } from "@/lib/import/ingest";
import { importRequestSchema } from "@/lib/zod/lead";

export interface ImportResult {
  ok: boolean;
  error?: string;
  importId?: string;
  imported?: number;
  skipped?: number;
  duplicatesInDb?: number;
  suppressed?: number;
}

/**
 * Import a CSV of prior leads. Parses + maps server-side (never trusts a
 * client-built lead array), then hands off to the shared ingestLeads pipeline
 * that enforces the prior-contact gate, suppression/dup filtering, and the audit
 * trail — the same path every M7 lead source uses.
 */
export async function importLeadsAction(raw: unknown): Promise<ImportResult> {
  const ctx = await requireOrg();

  const parsed = importRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid import request" };
  }
  const req = parsed.data;

  const csv = parseCsv(req.csvText);
  if (csv.rows.length === 0) return { ok: false, error: "No data rows found in the file." };
  const { leads, skipped } = applyMapping(csv, req.columnMap);
  if (leads.length === 0) {
    return { ok: false, error: "No valid leads after mapping. Did you map the email column?" };
  }

  const res = await ingestLeads(leads, {
    orgId: ctx.orgId,
    actorId: ctx.userId,
    name: req.name,
    source: "csv",
    fileName: req.fileName,
    columnMap: req.columnMap,
    consentBasis: req.consentBasis,
    priorContactAttested: req.priorContactAttested,
    totalRows: csv.rows.length,
  });
  if (!res.ok) return { ok: false, error: res.error };

  revalidatePath("/leads");
  revalidatePath("/");

  return {
    ok: true,
    importId: res.importId,
    imported: res.imported,
    skipped: skipped.length,
    duplicatesInDb: res.duplicatesInDb,
    suppressed: res.suppressed,
  };
}
