import Link from "next/link";
import { goLiveReport, type CheckStatus } from "@/lib/config/readiness";

export const dynamic = "force-dynamic";

const DOT: Record<CheckStatus, string> = {
  ok: "bg-sweep",
  warn: "bg-ember",
  missing: "bg-[#b43c3c]",
};
const LABEL: Record<CheckStatus, string> = { ok: "Ready", warn: "Heads-up", missing: "Blocking" };

export default async function ReadinessPage() {
  const report = await goLiveReport();

  return (
    <div className="mx-auto max-w-[860px] px-5 py-10 sm:px-8">
      <div className="mb-2 flex items-center justify-between">
        <p className="m-0 text-[12px] font-semibold uppercase tracking-[1.4px] text-muted-2">Platform · Go-Live</p>
        <Link href="/" className="text-[12.5px] font-semibold text-muted hover:text-ink">← Back to app</Link>
      </div>
      <h1 className="m-0 mb-4 font-heading text-[26px] font-semibold tracking-[-0.5px] text-ink">Go-Live Readiness</h1>

      {/* Verdict */}
      <div
        className={`mb-7 flex flex-wrap items-center gap-4 rounded-xl2 border p-5 ${
          report.ready ? "border-[rgba(27,122,87,0.25)] bg-sweep-mist" : "border-[#f0d2c9] bg-[#fbf0ec]"
        }`}
      >
        <span
          className={`flex h-11 w-11 flex-none items-center justify-center rounded-full font-heading text-[18px] font-bold text-white ${
            report.ready ? "bg-sweep" : "bg-[#b43c3c]"
          }`}
        >
          {report.ready ? "✓" : "!"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="m-0 font-heading text-[17px] font-semibold text-ink">
            {report.ready ? "All launch blockers clear" : `${report.blockers} launch blocker${report.blockers === 1 ? "" : "s"} remaining`}
          </p>
          <p className="m-0 text-[13px] text-muted">
            {report.ready
              ? "Every required integration is configured."
              : "The items marked Blocking below must be set before you can take real customers."}
            {report.warnings > 0 ? ` · ${report.warnings} heads-up${report.warnings === 1 ? "" : "s"}.` : ""}
          </p>
        </div>
      </div>

      {/* Groups */}
      <div className="flex flex-col gap-4">
        {report.groups.map((g) => (
          <div key={g.group} className="rounded-xl2 border border-line bg-white p-5 shadow-card">
            <div className="mb-3 flex items-center gap-2">
              <p className="m-0 font-heading text-[15px] font-semibold text-ink">{g.group}</p>
              {!g.blocking && <span className="rounded-full bg-cream px-2 py-0.5 text-[11px] font-semibold text-muted-3">informational</span>}
            </div>
            <div className="flex flex-col gap-2.5">
              {g.checks.map((c) => (
                <div key={c.label} className="flex items-start gap-3">
                  <span className={`mt-1.5 h-2.5 w-2.5 flex-none rounded-full ${DOT[c.status]}`} title={LABEL[c.status]} />
                  <div className="min-w-0 flex-1">
                    <p className="m-0 text-[13.5px] font-semibold text-ink">{c.label}</p>
                    <p className="m-0 text-[12.5px] leading-[1.5] text-muted">{c.detail}</p>
                  </div>
                  <span
                    className={`flex-none rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                      c.status === "ok" ? "bg-sweep-mist text-sweep" : c.status === "warn" ? "bg-[#fbf0ec] text-[#a14a2c]" : "bg-[#f7dede] text-[#b43c3c]"
                    }`}
                  >
                    {LABEL[c.status]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-6 text-[12px] text-muted-3">
        Reads live configuration (env + the in-app secret store) on each load. Nothing here changes any setting.
      </p>
    </div>
  );
}
