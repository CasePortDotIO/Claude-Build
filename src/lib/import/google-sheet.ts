/**
 * Build the Google Sheets CSV-export URL from a pasted sheet link. The export URL
 * is constructed from the EXTRACTED sheet id (and optional gid) only — never from
 * the raw pasted string — so the importer can only ever fetch a Google Sheets
 * export, not an arbitrary host (no SSRF). Returns null if it isn't a Sheets link.
 */
export function googleSheetExportUrl(rawUrl: string): string | null {
  const m = rawUrl.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!m) return null;
  const gid = rawUrl.match(/[#&?]gid=([0-9]+)/)?.[1] ?? "0";
  return `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv&gid=${gid}`;
}
