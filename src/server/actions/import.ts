"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { orgScoped } from "@/lib/tenancy";
import { requireOrg } from "@/lib/auth-helpers";
import { parseCsv } from "@/lib/import/csv";
import { applyMapping } from "@/lib/import/mapping";
import { assertPriorContact, PriorContactError } from "@/lib/import/prior-contact-gate";
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
 * Import a CSV of prior leads into the active org.
 *
 * Order of operations (all enforced server-side; the client cannot skip a step):
 *  1. Authn/authz via requireOrg().
 *  2. Validate the request shape (Zod).
 *  3. Prior-contact gate (§9) — refuse if not attested with a lawful basis.
 *  4. Re-parse the CSV and apply the column map server-side (never trust a
 *     client-built lead array).
 *  5. Drop leads already suppressed (opt-out/DNC) or already present in the org.
 *  6. Insert in a transaction with the import batch record + audit log.
 */
export async function importLeadsAction(raw: unknown): Promise<ImportResult> {
  const ctx = await requireOrg();
  const db = orgScoped(ctx.orgId);

  const parsed = importRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid import request" };
  }
  const req = parsed.data;

  // (3) Hard gate — this is reactivation, not cold outreach.
  try {
    assertPriorContact({ attested: req.priorContactAttested, consentBasis: req.consentBasis });
  } catch (e) {
    if (e instanceof PriorContactError) return { ok: false, error: e.message };
    throw e;
  }

  // (4) Re-parse + map server-side.
  const csv = parseCsv(req.csvText);
  if (csv.rows.length === 0) return { ok: false, error: "No data rows found in the file." };
  const { leads, skipped } = applyMapping(csv, req.columnMap);
  if (leads.length === 0) {
    return { ok: false, error: "No valid leads after mapping. Did you map the email column?" };
  }

  // (5) Filter against suppression list + existing org leads.
  const emails = leads.map((l) => l.email);
  const [suppressedRows, existingRows] = await Promise.all([
    db.suppression.findMany({ where: { email: { in: emails } }, select: { email: true } }),
    db.lead.findMany({ where: { email: { in: emails } }, select: { email: true } }),
  ]);
  const suppressedSet = new Set(suppressedRows.map((r) => r.email));
  const existingSet = new Set(existingRows.map((r) => r.email));

  const toInsert = leads.filter((l) => !suppressedSet.has(l.email) && !existingSet.has(l.email));
  const duplicatesInDb = leads.filter((l) => existingSet.has(l.email)).length;
  const suppressedCount = leads.filter((l) => suppressedSet.has(l.email)).length;

  // (6) Persist: import batch + leads + audit, in one transaction.
  const importRecord = await prisma.$transaction(async (tx) => {
    const record = await tx.leadImport.create({
      data: {
        orgId: ctx.orgId,
        name: req.name,
        source: "csv",
        fileName: req.fileName,
        columnMap: req.columnMap,
        totalRows: csv.rows.length,
        importedRows: toInsert.length,
        skippedRows: csv.rows.length - toInsert.length,
        priorContactAttested: true,
      },
    });

    if (toInsert.length > 0) {
      await tx.lead.createMany({
        data: toInsert.map((l) => ({
          orgId: ctx.orgId,
          importId: record.id,
          source: "csv",
          consentBasis: req.consentBasis,
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
        orgId: ctx.orgId,
        actorId: ctx.userId,
        action: "lead.import",
        targetType: "LeadImport",
        targetId: record.id,
        metadata: {
          imported: toInsert.length,
          duplicatesInDb,
          suppressed: suppressedCount,
          mappingSkipped: skipped.length,
        },
      },
    });

    return record;
  });

  revalidatePath("/leads");
  revalidatePath("/");

  return {
    ok: true,
    importId: importRecord.id,
    imported: toInsert.length,
    skipped: skipped.length,
    duplicatesInDb,
    suppressed: suppressedCount,
  };
}
