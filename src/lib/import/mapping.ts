import type { ParsedCsv } from "@/lib/import/csv";

// A normalized lead ready to insert (orgId is stamped later by the tenancy layer).
export interface MappedLead {
  email: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  phone?: string;
  originalInquiry?: string;
  statedGoal?: string;
  region?: string;
  lastEngagedAt?: string; // raw date string from the CSV; parsed at ingest
}

export interface MappingResult {
  leads: MappedLead[];
  skipped: { rowIndex: number; reason: string }[];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const OPTIONAL_FIELDS = [
  "firstName",
  "lastName",
  "company",
  "phone",
  "originalInquiry",
  "statedGoal",
  "region",
  "lastEngagedAt",
] as const;

/**
 * Apply a column map ({ leadField: csvHeader }) to parsed CSV rows, producing
 * clean MappedLead records. Rows are skipped (not failed) when:
 *  - email column isn't mapped at all (whole import would be invalid → caller checks),
 *  - a row has a missing/invalid email,
 *  - a row's email duplicates an earlier row in the same file (first wins).
 *
 * De-duplication against rows *already in the DB* happens in the import action;
 * this only dedupes within the uploaded file.
 */
export function applyMapping(parsed: ParsedCsv, columnMap: Record<string, string>): MappingResult {
  const leads: MappedLead[] = [];
  const skipped: MappingResult["skipped"] = [];
  const seen = new Set<string>();

  const emailHeader = columnMap.email;
  if (!emailHeader) {
    // No email mapping → every row is unusable. Report once via skipped list.
    return { leads: [], skipped: parsed.rows.map((_, i) => ({ rowIndex: i, reason: "No email column mapped" })) };
  }

  parsed.rows.forEach((row, i) => {
    const email = (row[emailHeader] ?? "").toLowerCase().trim();

    if (!email) {
      skipped.push({ rowIndex: i, reason: "Missing email" });
      return;
    }
    if (!EMAIL_RE.test(email)) {
      skipped.push({ rowIndex: i, reason: `Invalid email: ${email}` });
      return;
    }
    if (seen.has(email)) {
      skipped.push({ rowIndex: i, reason: `Duplicate in file: ${email}` });
      return;
    }
    seen.add(email);

    const lead: MappedLead = { email };
    for (const field of OPTIONAL_FIELDS) {
      const header = columnMap[field];
      const value = header ? (row[header] ?? "").trim() : "";
      if (value) lead[field] = value;
    }
    leads.push(lead);
  });

  return { leads, skipped };
}
