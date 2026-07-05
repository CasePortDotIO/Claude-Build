import { prisma } from "@/lib/prisma";
import { assertPriorContact, PriorContactError } from "@/lib/import/prior-contact-gate";
import { assertEntitled } from "@/lib/billing/entitle";
import { EntitlementError } from "@/lib/billing/entitlement-errors";
import { remainingOneTimeQuota } from "@/lib/billing/grant";
import { getEmailVerifier } from "@/lib/verify";
import type { MappedLead } from "@/lib/import/mapping";
import type { ConsentBasis, Prisma, Reachability } from "@prisma/client";

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
  imported: number; // sendable leads created (reachable + risky)
  duplicatesInDb: number;
  suppressed: number;
  // §3 pre-flight verification breakdown.
  reachable: number;
  risky: number;
  invalid: number; // failed verification — suppressed, never created as sendable
}

export async function ingestLeads(leads: MappedLead[], opts: IngestOptions): Promise<IngestResult> {
  // (1) Hard gate — reactivation, not cold outreach.
  const empty = { imported: 0, duplicatesInDb: 0, suppressed: 0, reachable: 0, risky: 0, invalid: 0 };
  try {
    assertPriorContact({ attested: opts.priorContactAttested, consentBasis: opts.consentBasis });
  } catch (e) {
    if (e instanceof PriorContactError) return { ok: false, error: e.message, ...empty };
    throw e;
  }
  if (leads.length === 0) {
    return { ok: false, error: "No valid leads to import.", ...empty };
  }

  // (1b) Entitlement gate — each import is a "list"; a single-list tier can't
  // create a second one. Unenforced when billing isn't configured (dev/CI).
  try {
    await assertEntitled(opts.orgId, "lists.create");
  } catch (e) {
    if (e instanceof EntitlementError) return { ok: false, error: e.message, ...empty };
    throw e;
  }

  // (2) Filter against suppression list + existing org leads (all org-scoped).
  const emails = leads.map((l) => l.email);
  const [suppressedRows, existingRows] = await Promise.all([
    prisma.suppressionEntry.findMany({ where: { orgId: opts.orgId, email: { in: emails } }, select: { email: true } }),
    prisma.lead.findMany({ where: { orgId: opts.orgId, email: { in: emails } }, select: { email: true } }),
  ]);
  const suppressedSet = new Set(suppressedRows.map((r) => r.email));
  const existingSet = new Set(existingRows.map((r) => r.email));

  const candidates = leads.filter((l) => !suppressedSet.has(l.email) && !existingSet.has(l.email));
  const duplicatesInDb = leads.filter((l) => existingSet.has(l.email)).length;
  const suppressed = leads.filter((l) => suppressedSet.has(l.email)).length;
  const totalRows = opts.totalRows ?? leads.length;

  // (2b) §3 PRE-FLIGHT VERIFICATION — the input gate. Classify every candidate
  // before a single one can be queued. INVALID is never created as a sendable
  // lead; it's hard-suppressed so a re-import can't resurrect it. RISKY is kept
  // but flagged (held out of the warmup ramp at send time). This is the line
  // between "reactivate dead leads" working and burning the customer's domain.
  const verifier = getEmailVerifier();
  const verdicts = await verifier.verify(candidates.map((l) => l.email));
  const byEmail = new Map(verdicts.map((v) => [v.email.toLowerCase(), v]));
  const verdictFor = (email: string) =>
    byEmail.get(email.toLowerCase()) ?? { email, status: "RISKY" as Reachability, reason: "unverified" };

  let toInsert = candidates.filter((l) => verdictFor(l.email).status !== "INVALID");
  const invalidEmails = candidates.map((l) => l.email).filter((e) => verdictFor(e).status === "INVALID");

  // M9: stamp each lead with the operator's average client value so the dormant
  // pipeline is real and the recovered-revenue KPI has something to count when
  // a lead eventually books. 0 (the default) simply means "not told yet".
  const org = await prisma.org.findUnique({ where: { id: opts.orgId }, select: { avgClientValueCents: true, oneTimeLeadQuota: true } });
  const dealValueCents = org?.avgClientValueCents ?? 0;

  // One-time tiers (Founding $27 / +$17 bump) carry a TOTAL lead quota — a $27
  // buyer sweeps their first 100 (or 500) leads, not an unbounded monthly meter.
  // Trim the import to what's left of the quota so margin holds on a one-time fee.
  // (The trimmed leads fall into skippedRows below.)
  if (org?.oneTimeLeadQuota != null) {
    const existing = await prisma.lead.count({ where: { orgId: opts.orgId } });
    const remaining = remainingOneTimeQuota(org.oneTimeLeadQuota, existing);
    if (toInsert.length > remaining) toInsert = toInsert.slice(0, remaining);
    if (toInsert.length === 0) {
      return { ok: false, error: "You've reached your plan's lead limit — upgrade to sweep more.", ...empty };
    }
  }

  const reachable = toInsert.filter((l) => verdictFor(l.email).status === "REACHABLE").length;
  const risky = toInsert.length - reachable;

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
      const now = new Date();
      await tx.lead.createMany({
        data: toInsert.map((l) => {
          const v = verdictFor(l.email);
          return {
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
            dealValueCents,
            reachability: v.status,
            verifiedAt: now,
            verifyReason: v.reason,
          };
        }),
        skipDuplicates: true,
      });
    }

    // INVALID addresses are hard-suppressed so they can never be sent to, and a
    // future re-import drops them at the suppression filter above.
    if (invalidEmails.length > 0) {
      await tx.suppressionEntry.createMany({
        data: invalidEmails.map((email) => ({
          orgId: opts.orgId,
          email: email.toLowerCase(),
          reason: "INVALID" as const,
          note: verdictFor(email).reason,
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
        metadata: { source: opts.source, imported: toInsert.length, duplicatesInDb, suppressed, reachable, risky, invalid: invalidEmails.length },
      },
    });

    return batch;
  });

  return {
    ok: true,
    importId: record.id,
    imported: toInsert.length,
    duplicatesInDb,
    suppressed,
    reachable,
    risky,
    invalid: invalidEmails.length,
  };
}
