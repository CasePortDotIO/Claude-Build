import { prisma } from "@/lib/prisma";
import { assertPriorContact, PriorContactError } from "@/lib/import/prior-contact-gate";
import type { MappedLead } from "@/lib/import/mapping";
import type { ConsentBasis, Prisma } from "@prisma/client";

/**
 * The single lead-ingest pipeline shared by every importer (CSV + all M7 lead
 * sources). Whatever the source, leads land here as normalized MappedLead[] and
 * pass through the SAME guarantees:
 *   - prior-contact gate (§9) — reactivation only,
 *   - drop emails on the org suppression list,
 *   - de-dupe against leads already in the org,
 *   - one transaction: LeadImport batch + leads + audit log.
 */

export interface IngestOptions {
  orgId: string;
  actorId?: string;
  name: string; // sweep / import name
  source: string; // "csv" | "hubspot" | ...
  fileName?: string;
  columnMap?: Prisma.InputJsonValue;
  consentBasis: ConsentBasis;
  priorContactAttested: boolean;
  totalRows?: number; // raw row count (for the batch record)
}

export interface IngestResult {
  ok: boolean;
  error?: string;
  importId?: string;
  imported: number;
  duplicatesInDb: number;
  suppressed: number;
}

export async function ingestLeads(leads: MappedLead[], opts: IngestOptions): Promise<IngestResult> {
  // (1) Hard gate — reactivation, not cold outreach.
  try {
    assertPriorContact({ attested: opts.priorContactAttested, consentBasis: opts.consentBasis });
  } catch (e) {
    if (e instanceof PriorContactError) return { ok: false, error: e.message, imported: 0, duplicatesInDb: 0, suppressed: 0 };
    throw e;
  }
  if (leads.length === 0) {
    return { ok: false, error: "No valid leads to import.", imported: 0, duplicatesInDb: 0, suppressed: 0 };
  }

  // (2) Filter against suppression list + existing org leads (all org-scoped).
  const emails = leads.map((l) => l.email);
  const [suppressedRows, existingRows] = await Promise.all([
    prisma.suppressionEntry.findMany({ where: { orgId: opts.orgId, email: { in: emails } }, select: { email: true } }),
    prisma.lead.findMany({ where: { orgId: opts.orgId, email: { in: emails } }, select: { email: true } }),
  ]);
  const suppressedSet = new Set(suppressedRows.map((r) => r.email));
  const existingSet = new Set(existingRows.map((r) => r.email));

  const toInsert = leads.filter((l) => !suppressedSet.has(l.email) && !existingSet.has(l.email));
  const duplicatesInDb = leads.filter((l) => existingSet.has(l.email)).length;
  const suppressed = leads.filter((l) => suppressedSet.has(l.email)).length;
  const totalRows = opts.totalRows ?? leads.length;

  // (3) Persist atomically.
  const record = await prisma.$transaction(async (tx) => {
    const batch = await tx.leadImport.create({
      data: {
        orgId: opts.orgId,
        name: opts.name,
        source: opts.source,
        fileName: opts.fileName,
        columnMap: opts.columnMap ?? {},
        totalRows,
        importedRows: toInsert.length,
        skippedRows: totalRows - toInsert.length,
        priorContactAttested: true,
      },
    });

    if (toInsert.length > 0) {
      await tx.lead.createMany({
        data: toInsert.map((l) => ({
          orgId: opts.orgId,
          importId: batch.id,
          source: opts.source,
          consentBasis: opts.consentBasis,
          priorContact: true,
          status: "NEW" as const,
          email: l.email,
          firstName: l.firstName,
          lastName: l.lastName,
          company: l.company,
          phone: l.phone,
          originalInquiry: l.originalInquiry,
          statedGoal: l.statedGoal,
          region: l.region,
        })),
        skipDuplicates: true,
      });
    }

    await tx.auditLog.create({
      data: {
        orgId: opts.orgId,
        actorId: opts.actorId,
        action: "lead.import",
        targetType: "LeadImport",
        targetId: batch.id,
        metadata: { source: opts.source, imported: toInsert.length, duplicatesInDb, suppressed },
      },
    });

    return batch;
  });

  return { ok: true, importId: record.id, imported: toInsert.length, duplicatesInDb, suppressed };
}
