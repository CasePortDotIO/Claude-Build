import { prisma } from "@/lib/prisma";
import { parseCsv } from "@/lib/import/csv";
import { applyMapping } from "@/lib/import/mapping";
import { ingestLeads } from "@/lib/import/ingest";
import type { ConsentBasis } from "@prisma/client";

/**
 * Done-for-you onboarding (M17). An agency admin imports a CSV directly INTO a
 * client workspace, collapsing the new-operator effort from "export, upload, map,
 * attest" to "forward me a CSV." The agency does it for them.
 *
 * Tenant isolation is the load-bearing check: the target must be a CLIENT whose
 * parentAgencyId is the caller's agency, or the import is refused — an agency can
 * never write leads into a workspace it doesn't own. Everything downstream reuses
 * the exact CSV → ingest pipeline (prior-contact gate, suppression, §3
 * verification, audit), so a concierge import carries the same guarantees as a
 * self-serve one. Auth (caller is AGENCY_ADMIN) is enforced by the server action;
 * this layer is pure so the isolation rule is unit-testable without a session.
 */

/** The client org IFF it belongs to this agency — else null. The isolation gate. */
export async function resolveClientForAgency(agencyOrgId: string, clientOrgId: string) {
  return prisma.org.findFirst({
    where: { id: clientOrgId, type: "CLIENT", parentAgencyId: agencyOrgId },
    select: { id: true, name: true, avgClientValueCents: true },
  });
}

export interface AgencyImportInput {
  agencyOrgId: string; // caller's agency (already authorized as AGENCY_ADMIN)
  actorId: string; // the agency admin performing the import
  clientOrgId: string; // target client workspace
  csvText: string;
  columnMap: Record<string, string>;
  name: string;
  fileName?: string;
  consentBasis: ConsentBasis;
  priorContactAttested: boolean;
  avgClientValueDollars?: number;
}

export interface AgencyImportResult {
  ok: boolean;
  error?: string;
  importId?: string;
  imported?: number;
  skipped?: number;
  reachable?: number;
  duplicatesInDb?: number;
  suppressed?: number;
}

export async function importLeadsForClient(input: AgencyImportInput): Promise<AgencyImportResult> {
  const client = await resolveClientForAgency(input.agencyOrgId, input.clientOrgId);
  if (!client) return { ok: false, error: "That workspace isn't a client of your agency." };

  const csv = parseCsv(input.csvText);
  if (csv.rows.length === 0) return { ok: false, error: "No data rows found in the file." };
  const { leads, skipped } = applyMapping(csv, input.columnMap);
  if (leads.length === 0) {
    return { ok: false, error: "No valid leads after mapping. Did you map the email column?" };
  }

  if (typeof input.avgClientValueDollars === "number" && input.avgClientValueDollars > 0) {
    await prisma.org.update({
      where: { id: client.id },
      data: { avgClientValueCents: Math.round(input.avgClientValueDollars * 100) },
    });
  }

  const res = await ingestLeads(leads, {
    orgId: client.id,
    actorId: input.actorId, // the agency admin who performed the done-for-you import
    name: input.name,
    source: "csv",
    fileName: input.fileName,
    columnMap: input.columnMap,
    consentBasis: input.consentBasis,
    priorContactAttested: input.priorContactAttested,
    totalRows: csv.rows.length,
  });
  if (!res.ok) return { ok: false, error: res.error };

  return {
    ok: true,
    importId: res.importId,
    imported: res.imported,
    skipped: skipped.length,
    reachable: res.reachable,
    duplicatesInDb: res.duplicatesInDb,
    suppressed: res.suppressed,
  };
}
