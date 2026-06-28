import { z } from "zod";

// A single mapped lead (post column-map). Mirrors MappedLead in import/mapping.
export const mappedLeadSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  firstName: z.string().trim().max(120).optional(),
  lastName: z.string().trim().max(120).optional(),
  company: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(60).optional(),
  originalInquiry: z.string().trim().max(5000).optional(),
  statedGoal: z.string().trim().max(2000).optional(),
  region: z.string().trim().max(120).optional(),
});

// Payload the import server action accepts. The raw CSV text + the chosen
// column map + the prior-contact attestation. We re-parse server-side rather
// than trusting a client-built lead array.
export const importRequestSchema = z.object({
  name: z.string().trim().min(1, "Sweep name is required").max(160),
  fileName: z.string().trim().max(260).optional(),
  csvText: z.string().min(1, "CSV content is empty").max(5_000_000),
  columnMap: z.record(z.string(), z.string()),
  priorContactAttested: z.boolean(),
  consentBasis: z
    .enum(["PRIOR_INQUIRY", "EXISTING_CUSTOMER", "EXPLICIT_CONSENT", "LEGITIMATE_INTEREST", "UNKNOWN"])
    .default("PRIOR_INQUIRY"),
  // M9: what one client is worth (whole dollars, from the wizard). Stamps each
  // lead's value + powers the dormant-pipeline reveal. Capped to keep the math sane.
  avgClientValueDollars: z.number().int().min(0).max(1_000_000).optional(),
});

export type ImportRequest = z.infer<typeof importRequestSchema>;

// M17 done-for-you: the same import payload, plus the target client workspace.
// An agency admin imports into a client they own (tenant-checked server-side).
export const agencyImportRequestSchema = importRequestSchema.extend({
  clientOrgId: z.string().min(1, "Pick a client workspace"),
});

export type AgencyImportRequest = z.infer<typeof agencyImportRequestSchema>;

export const leadFilterSchema = z.object({
  status: z.string().optional(),
  q: z.string().trim().max(200).optional(),
});
