"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { parseCsv } from "@/lib/import/csv";
import { applyMapping } from "@/lib/import/mapping";
import { ingestLeads } from "@/lib/import/ingest";
import { googleSheetExportUrl } from "@/lib/import/google-sheet";
import { importRequestSchema } from "@/lib/zod/lead";

export interface ImportResult {
  ok: boolean;
  error?: string;
  importId?: string;
  imported?: number;
  skipped?: number;
  duplicatesInDb?: number;
  suppressed?: number;
  // §3 pre-flight verification breakdown.
  reachable?: number;
  risky?: number;
  invalid?: number;
  // M9: the dormant-pipeline reveal — what just walked back through the door.
  avgClientValueCents?: number;
  dormantPipelineCents?: number; // imported × avg client value
}

export interface SheetCsvResult {
  ok: boolean;
  error?: string;
  csv?: string;
}

/**
 * Fetch a Google Sheet as CSV so it can flow through the same import pipeline as
 * a CSV/Excel upload. Only ever hits the Google Sheets CSV export endpoint built
 * from the extracted sheet id (never the raw pasted URL) — no SSRF surface. The
 * sheet must be shared "anyone with the link can view" for the export to work.
 */
export async function fetchGoogleSheetCsvAction(rawUrl: string): Promise<SheetCsvResult> {
  await requireOrg();
  const exportUrl = googleSheetExportUrl(rawUrl);
  if (!exportUrl) return { ok: false, error: "That doesn't look like a Google Sheets link." };
  try {
    const res = await fetch(exportUrl, { redirect: "follow" });
    const text = await res.text();
    const ct = res.headers.get("content-type") ?? "";
    // Google returns an HTML login/permission page (200) for private sheets.
    if (!res.ok || ct.includes("text/html") || text.trimStart().startsWith("<")) {
      return { ok: false, error: "Couldn't read that sheet — share it as “anyone with the link can view” and try again." };
    }
    if (text.length > 5_000_000) return { ok: false, error: "That sheet is too large — export a CSV under 5MB." };
    return { ok: true, csv: text };
  } catch {
    return { ok: false, error: "Couldn't reach Google Sheets — check the link and try again." };
  }
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

  // M9: remember what a client is worth (if the operator told us this sweep) so
  // every imported lead is stamped with it inside ingest. Persist before ingest.
  if (typeof req.avgClientValueDollars === "number" && req.avgClientValueDollars > 0) {
    await prisma.org.update({
      where: { id: ctx.orgId },
      data: { avgClientValueCents: Math.round(req.avgClientValueDollars * 100) },
    });
  }
  const orgValue = await prisma.org.findUnique({ where: { id: ctx.orgId }, select: { avgClientValueCents: true } });
  const avgClientValueCents = orgValue?.avgClientValueCents ?? 0;

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
    reachable: res.reachable,
    risky: res.risky,
    invalid: res.invalid,
    avgClientValueCents,
    // The dormant pipeline is what we can actually WORK — the reachable set only.
    dormantPipelineCents: avgClientValueCents * res.reachable,
  };
}
