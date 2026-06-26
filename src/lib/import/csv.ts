import Papa from "papaparse";

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
}

/**
 * Parse a CSV string into headers + row objects keyed by header.
 * Header-aware, trims whitespace, skips fully-empty lines. Pure and synchronous
 * so it's trivially unit-testable and runs in the server action without I/O.
 */
export function parseCsv(text: string): ParsedCsv {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
    transform: (v) => (typeof v === "string" ? v.trim() : v),
  });

  const headers = (result.meta.fields ?? []).filter((h) => h.length > 0);
  // Drop rows that are entirely empty after trimming.
  const rows = (result.data ?? []).filter((row) =>
    headers.some((h) => (row[h] ?? "").length > 0),
  );

  return { headers, rows };
}

/**
 * Best-effort guess of which CSV header maps to which lead field, by fuzzy
 * name match. The operator confirms/overrides this in the ColumnMapper UI;
 * we never import on a guess alone.
 */
const FIELD_SYNONYMS: Record<string, string[]> = {
  email: ["email", "e-mail", "email address", "mail", "contact email"],
  firstName: ["first name", "firstname", "first", "given name", "fname"],
  lastName: ["last name", "lastname", "last", "surname", "lname"],
  company: ["company", "organization", "organisation", "business", "account"],
  phone: ["phone", "phone number", "mobile", "cell", "tel"],
  originalInquiry: ["inquiry", "enquiry", "interest", "message", "notes", "what they wanted"],
  statedGoal: ["goal", "objective", "outcome"],
  region: ["region", "country", "location", "timezone", "state"],
};

export function guessColumnMap(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  const lowered = headers.map((h) => ({ raw: h, norm: h.toLowerCase().trim() }));

  for (const [field, synonyms] of Object.entries(FIELD_SYNONYMS)) {
    const hit = lowered.find((h) => synonyms.includes(h.norm));
    if (hit) map[field] = hit.raw;
  }
  return map;
}
