"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { IMPORTABLE_FIELDS } from "@/lib/types";
import { importLeadsAction, type ImportResult } from "@/server/actions/import";
import { CountUp } from "@/components/magic/CountUp";
import { TrustStrip } from "@/components/magic/TrustStrip";
import { formatMoney } from "@/lib/format";

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
  const [avgValue, setAvgValue] = useState(""); // dollars a client is worth
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
    const avgDollars = Math.max(0, Math.round(Number(avgValue.replace(/[^0-9.]/g, "")) || 0));
    const res = await importLeadsAction({
      name: sweepName || fileName || "Untitled sweep",
      fileName,
      csvText,
      columnMap,
      priorContactAttested: attested,
      consentBasis,
      avgClientValueDollars: avgDollars || undefined,
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
    const imported = result.imported ?? 0;
    const dormant = result.dormantPipelineCents ?? 0;
    // Conservative recovery estimate: industry-typical reactivation lands ~3–8%.
    // We show the floor (5%) so the number under-promises, then over-delivers.
    const recoverableCents = Math.round(dormant * 0.05);
    const hasMoney = dormant > 0;

    return (
      <div className="max-w-[860px]">
        {/* The reveal — the money that just walked back through the door. */}
        <div className="relative overflow-hidden rounded-xl2 bg-charcoal p-8 text-white sm:p-10">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-charcoal-soft px-3 py-1.5 text-[11.5px] font-semibold uppercase tracking-[1.6px] text-sweep-light">
            <span className="inline-block h-2 w-2 animate-wsPulse rounded-full bg-sweep-light" />
            Sweep imported
          </div>
          {hasMoney ? (
            <>
              <p className="m-0 mb-1.5 text-[14px] text-on-dark-soft">
                You just reconnected with <strong className="font-semibold text-white">{imported.toLocaleString("en-US")}</strong> prior
                {imported === 1 ? " contact" : " contacts"} sitting on
              </p>
              <p className="m-0 font-heading text-[52px] font-semibold leading-none tracking-[-2px] tabular-nums sm:text-[64px]">
                <CountUp to={dormant} money />
              </p>
              <p className="m-0 mt-2.5 text-[14px] text-on-dark-soft">
                in dormant pipeline — revenue you already earned the right to, never followed up on.
              </p>
              <div className="mt-6 flex flex-wrap gap-2.5">
                <span className="rounded-md bg-sweep px-3 py-1.5 text-[12.5px] font-semibold text-white">
                  ~{formatMoney(recoverableCents)} recoverable at just a 5% reactivation rate
                </span>
                <span className="rounded-md bg-charcoal-soft px-3 py-1.5 text-[12.5px] text-on-dark-soft">
                  {formatMoney(result.avgClientValueCents ?? 0)} / client
                </span>
              </div>
            </>
          ) : (
            <>
              <p className="m-0 font-heading text-[40px] font-semibold leading-none tracking-[-1.5px] tabular-nums sm:text-[52px]">
                <CountUp to={imported} />
              </p>
              <p className="m-0 mt-2.5 max-w-[520px] text-[14px] text-on-dark-soft">
                prior contacts are back in play and ready for the agent. Tell us what a client is worth on your next
                sweep and we&apos;ll show you the dormant pipeline in dollars.
              </p>
            </>
          )}
        </div>

        {/* the receipts — honest accounting of what landed vs. was filtered */}
        <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat n={imported} label="imported" tone="sweep" />
          <Stat n={result.duplicatesInDb ?? 0} label="already in list" />
          <Stat n={result.suppressed ?? 0} label="suppressed" />
          <Stat n={result.skipped ?? 0} label="bad / no email" />
        </ul>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            onClick={() => router.push("/leads")}
            className="rounded-lg bg-ember px-5 py-3 font-heading text-[14px] font-semibold text-white hover:bg-ember-hover"
          >
            Draft the first emails →
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
        <>
        <div className="rounded-xl2 border border-line bg-white p-7">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-[13px] font-semibold text-ink">Sweep name</label>
              <input
                value={sweepName}
                onChange={(e) => setSweepName(e.target.value)}
                placeholder="Cold leads · Q1"
                className="w-full rounded-lg border border-line-3 bg-white px-3.5 py-3 text-[14.5px] outline-none focus:border-sweep focus:ring-2 focus:ring-[rgba(27,122,87,0.12)]"
              />
            </div>
            <div>
              <label className="mb-2 block text-[13px] font-semibold text-ink">
                What&apos;s a client worth to you?
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[14.5px] text-muted-3">$</span>
                <input
                  value={avgValue}
                  onChange={(e) => setAvgValue(e.target.value)}
                  inputMode="numeric"
                  placeholder="2,000"
                  className="w-full rounded-lg border border-line-3 bg-white py-3 pl-7 pr-3 text-[14.5px] outline-none focus:border-sweep focus:ring-2 focus:ring-[rgba(27,122,87,0.12)]"
                />
              </div>
              <p className="m-0 mt-1.5 text-[11.5px] text-muted-3">Optional — unlocks your dormant pipeline in dollars.</p>
            </div>
          </div>
          <label className="mb-2 mt-5 block text-[13px] font-semibold text-ink">Lead list (CSV)</label>
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
        <TrustStrip className="mt-4" />
        </>
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

function Stat({ n, label, tone }: { n: number; label: string; tone?: "sweep" }) {
  return (
    <li className="rounded-xl2 border border-line bg-white px-4 py-3 text-center">
      <p className={`m-0 font-heading text-[22px] font-semibold tabular-nums ${tone === "sweep" ? "text-sweep" : "text-ink"}`}>
        {n.toLocaleString("en-US")}
      </p>
      <p className="m-0 text-[11.5px] text-muted-2">{label}</p>
    </li>
  );
}
