"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { IMPORTABLE_FIELDS } from "@/lib/types";
import { importLeadsAction, type ImportResult } from "@/server/actions/import";

type Step = "upload" | "map" | "done";

interface Preview {
  headers: string[];
  rows: Record<string, string>[];
  rowCount: number;
}

const CONSENT_OPTIONS = [
  { value: "PRIOR_INQUIRY", label: "They previously inquired with me" },
  { value: "EXISTING_CUSTOMER", label: "They're an existing/past customer" },
  { value: "EXPLICIT_CONSENT", label: "They explicitly opted in" },
  { value: "LEGITIMATE_INTEREST", label: "Legitimate interest (documented)" },
];

// Fuzzy guess mirrored from lib/import/csv.ts so the UI pre-fills sensibly.
function guess(headers: string[]): Record<string, string> {
  const syn: Record<string, string[]> = {
    email: ["email", "e-mail", "email address", "mail"],
    firstName: ["first name", "firstname", "first", "fname"],
    lastName: ["last name", "lastname", "last", "lname", "surname"],
    company: ["company", "organization", "business", "account"],
    phone: ["phone", "mobile", "cell", "tel"],
    originalInquiry: ["inquiry", "enquiry", "interest", "message", "notes"],
    statedGoal: ["goal", "objective", "outcome"],
    region: ["region", "country", "location", "state"],
  };
  const out: Record<string, string> = {};
  const low = headers.map((h) => ({ raw: h, n: h.toLowerCase().trim() }));
  for (const [field, names] of Object.entries(syn)) {
    const hit = low.find((h) => names.includes(h.n));
    if (hit) out[field] = hit.raw;
  }
  return out;
}

export function ImportWizard() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("upload");
  const [csvText, setCsvText] = useState("");
  const [fileName, setFileName] = useState("");
  const [sweepName, setSweepName] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [columnMap, setColumnMap] = useState<Record<string, string>>({});
  const [attested, setAttested] = useState(false);
  const [consentBasis, setConsentBasis] = useState("PRIOR_INQUIRY");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function onFile(file: File) {
    setError(null);
    setFileName(file.name);
    if (!sweepName) setSweepName(file.name.replace(/\.csv$/i, ""));
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      setCsvText(text);
      const parsed = Papa.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: "greedy",
        transformHeader: (h) => h.trim(),
      });
      const headers = (parsed.meta.fields ?? []).filter(Boolean);
      if (headers.length === 0) {
        setError("Couldn't read any columns from that file. Is it a CSV with a header row?");
        return;
      }
      const rows = (parsed.data ?? []).filter((r) => headers.some((h) => (r[h] ?? "").trim()));
      setPreview({ headers, rows: rows.slice(0, 5), rowCount: rows.length });
      setColumnMap(guess(headers));
      setStep("map");
    };
    reader.readAsText(file);
  }

  async function submit() {
    setError(null);
    if (!columnMap.email) {
      setError("Map the Email column — it's required.");
      return;
    }
    if (!attested) {
      setError("Confirm these leads are prior contacts before importing.");
      return;
    }
    setSubmitting(true);
    const res = await importLeadsAction({
      name: sweepName || fileName || "Untitled sweep",
      fileName,
      csvText,
      columnMap,
      priorContactAttested: attested,
      consentBasis,
    });
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error ?? "Import failed.");
      return;
    }
    setResult(res);
    setStep("done");
  }

  if (step === "done" && result) {
    return (
      <div className="rounded-xl2 border border-line bg-white p-8">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-sweep-mist">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1B7A57" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </div>
        <h2 className="m-0 mb-2 font-heading text-[22px] font-semibold text-ink">Sweep imported</h2>
        <p className="m-0 mb-5 text-[14px] text-muted">
          <strong className="text-ink">{result.imported}</strong> prior contacts are now scoped to your workspace and
          ready for the agent.
        </p>
        <ul className="m-0 mb-6 list-none space-y-1.5 p-0 text-[13.5px] text-muted">
          <li>✓ {result.imported} imported</li>
          {result.duplicatesInDb ? <li>↩ {result.duplicatesInDb} already in your list (skipped)</li> : null}
          {result.suppressed ? <li>⛔ {result.suppressed} on suppression list (skipped)</li> : null}
          {result.skipped ? <li>· {result.skipped} rows skipped (bad/missing email)</li> : null}
        </ul>
        <div className="flex gap-3">
          <button
            onClick={() => router.push("/leads")}
            className="rounded-lg bg-ember px-5 py-3 font-heading text-[14px] font-semibold text-white hover:bg-ember-hover"
          >
            View leads →
          </button>
          <button
            onClick={() => {
              setStep("upload");
              setResult(null);
              setPreview(null);
              setCsvText("");
              setAttested(false);
            }}
            className="rounded-lg border border-line-3 bg-white px-5 py-3 text-[14px] font-semibold text-muted hover:bg-cream"
          >
            Import another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[860px]">
      {error && (
        <div className="mb-4 rounded-lg border border-[#f0d2c9] bg-[#fbf0ec] px-4 py-3 text-[13.5px] text-[#a14a2c]">
          {error}
        </div>
      )}

      {step === "upload" && (
        <div className="rounded-xl2 border border-line bg-white p-7">
          <label className="mb-2 block text-[13px] font-semibold text-ink">Sweep name</label>
          <input
            value={sweepName}
            onChange={(e) => setSweepName(e.target.value)}
            placeholder="Cold leads · Q1"
            className="mb-5 w-full rounded-lg border border-line-3 bg-white px-3.5 py-3 text-[14.5px] outline-none focus:border-sweep focus:ring-2 focus:ring-[rgba(27,122,87,0.12)]"
          />
          <label className="mb-2 block text-[13px] font-semibold text-ink">Lead list (CSV)</label>
          <label className="block cursor-pointer rounded-xl border-2 border-dashed border-[#d2ccbe] bg-white p-8 text-center hover:border-sweep">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#1B7A57" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
            </svg>
            <p className="m-0 text-[14px] font-semibold text-ink">Drop a CSV or click to choose</p>
            <p className="m-0 mt-1 text-[12.5px] text-muted">First row should be column headers</p>
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            />
          </label>
        </div>
      )}

      {step === "map" && preview && (
        <div className="space-y-4">
          {/* mapper */}
          <div className="rounded-xl2 border border-line bg-white p-7">
            <h3 className="m-0 mb-1 font-heading text-[16px] font-semibold text-ink">Map your columns</h3>
            <p className="m-0 mb-5 text-[13px] text-muted">
              {preview.rowCount} contacts detected in <span className="font-medium text-ink">{fileName}</span>. Match
              each field to a column — only Email is required.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {IMPORTABLE_FIELDS.map((field) => (
                <div key={field.key} className="flex items-center gap-3">
                  <label className="w-[130px] flex-none text-[13px] text-muted">
                    {field.label}
                    {field.required && <span className="text-ember"> *</span>}
                  </label>
                  <select
                    value={columnMap[field.key] ?? ""}
                    onChange={(e) =>
                      setColumnMap((m) => {
                        const next = { ...m };
                        if (e.target.value) next[field.key] = e.target.value;
                        else delete next[field.key];
                        return next;
                      })
                    }
                    className="flex-1 rounded-lg border border-line-3 bg-white px-3 py-2 text-[13.5px] outline-none focus:border-sweep"
                  >
                    <option value="">— skip —</option>
                    {preview.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* preview table */}
          <div className="overflow-hidden rounded-xl2 border border-line bg-white">
            <div className="border-b border-line-2 bg-cream-head px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.8px] text-muted-3">
              Preview · first {preview.rows.length} rows
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-line-2 text-left text-muted-3">
                    {preview.headers.map((h) => (
                      <th key={h} className="whitespace-nowrap px-4 py-2 font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r, i) => (
                    <tr key={i} className="border-b border-line-2 last:border-b-0">
                      {preview.headers.map((h) => (
                        <td key={h} className="max-w-[200px] truncate px-4 py-2 text-ink-soft">
                          {r[h]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* prior-contact gate */}
          <div className="rounded-xl2 border border-[#f0dcc9] bg-[#FBF3EC] p-5">
            <p className="m-0 mb-3 text-[13.5px] leading-[1.5] text-[#7a5a44]">
              <strong className="font-semibold text-[#5a4030]">The Warm Sweep only re-engages prior contacts.</strong>{" "}
              Confirm a lawful basis before importing — this is reactivation, not cold outreach.
            </p>
            <select
              value={consentBasis}
              onChange={(e) => setConsentBasis(e.target.value)}
              className="mb-3 w-full rounded-lg border border-[#e6d3bf] bg-white px-3 py-2 text-[13.5px] outline-none focus:border-ember"
            >
              {CONSENT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <label className="flex items-start gap-2.5 text-[13.5px] text-[#5a4030]">
              <input
                type="checkbox"
                checked={attested}
                onChange={(e) => setAttested(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-ember"
              />
              <span>
                I confirm everyone in this list has a prior relationship or inquiry with my business, and I have a
                lawful basis to re-engage them.
              </span>
            </label>
          </div>

          <div className="flex gap-3">
            <button
              onClick={submit}
              disabled={submitting}
              className="rounded-lg bg-ember px-5 py-3 font-heading text-[14px] font-semibold text-white hover:bg-ember-hover disabled:opacity-60"
            >
              {submitting ? "Importing…" : "Import sweep →"}
            </button>
            <button
              onClick={() => setStep("upload")}
              className="rounded-lg border border-line-3 bg-white px-5 py-3 text-[14px] font-semibold text-muted hover:bg-cream"
            >
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
