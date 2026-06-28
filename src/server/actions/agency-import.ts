"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/auth-helpers";
import { assertRole } from "@/lib/roles";
import { importLeadsForClient, type AgencyImportResult } from "@/lib/import/agency-import";
import { agencyImportRequestSchema } from "@/lib/zod/lead";

/**
 * Done-for-you import: an agency admin imports a CSV into one of their client
 * workspaces. Authorization is two-layered — the caller must be AGENCY_ADMIN
 * (here), and the target must be a client of THIS agency (enforced in
 * importLeadsForClient's tenant gate). The CSV is parsed server-side; we never
 * trust a client-built lead array.
 */
export async function importLeadsForClientAction(raw: unknown): Promise<AgencyImportResult> {
  const ctx = await requireOrg();
  try {
    assertRole(ctx, "AGENCY_ADMIN");
  } catch {
    return { ok: false, error: "Only an agency admin can import for a client." };
  }

  const parsed = agencyImportRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid import request" };
  }
  const req = parsed.data;

  const res = await importLeadsForClient({
    agencyOrgId: ctx.orgId,
    actorId: ctx.userId,
    clientOrgId: req.clientOrgId,
    csvText: req.csvText,
    columnMap: req.columnMap,
    name: req.name,
    fileName: req.fileName,
    consentBasis: req.consentBasis,
    priorContactAttested: req.priorContactAttested,
    avgClientValueDollars: req.avgClientValueDollars,
  });

  if (res.ok) {
    revalidatePath("/clients");
    revalidatePath("/");
  }
  return res;
}
