import { formatMoney } from "@/lib/format";
import type { AgentMaturity, RoiLedger } from "@/lib/retention";

/**
 * Agent maturity + ROI ledger (M10). The switching cost, made legible. The score
 * climbs only with use — voice trained, leads remembered, insights applied,
 * reputation warmed, lift measured — so the number on screen IS the thing a coach
 * would reset to zero by leaving. The ledger underneath is the running total of
 * money the agent has put back on the table: loss aversion, quantified.
 */
export function AgentMaturityCard({ maturity, ledger }: { maturity: AgentMaturity; ledger: RoiLedger }) {
  const { score, tier, components } = maturity;
  // Conic ring for the headline score.
  const ring = `conic-gradient(#5CA98A ${score * 3.6}deg, rgba(255,255,255,0.10) 0deg)`;

  return (
    <div className="mb-[18px] overflow-hidden rounded-xl2 bg-charcoal p-7">
      <div className="flex flex-wrap items-center gap-7">
        {/* score ring */}
        <div className="relative flex h-[128px] w-[128px] flex-none items-center justify-center rounded-full" style={{ background: ring }}>
          <div className="flex h-[104px] w-[104px] flex-col items-center justify-center rounded-full bg-charcoal">
            <span className="font-heading text-[34px] font-semibold leading-none text-white tabular-nums">{score}</span>
            <span className="mt-1 text-[10.5px] uppercase tracking-[1.4px] text-on-dark-mute">trained</span>
          </div>
        </div>

        <div className="min-w-[240px] flex-1">
          <div className="mb-1 flex items-center gap-2.5">
            <p className="m-0 font-heading text-[20px] font-semibold text-white">{tier} agent</p>
            <span className="rounded-full bg-[rgba(92,169,138,0.16)] px-2.5 py-1 text-[11px] font-semibold text-sweep-light">
              {maturity.selfUpdates} self-update{maturity.selfUpdates === 1 ? "" : "s"}
            </span>
          </div>
          <p className="m-0 mb-4 max-w-[520px] text-[13px] leading-[1.5] text-on-dark-soft">
            This agent has been trained on your voice and your list. Everything it&apos;s learned lives here — and
            compounds the longer it runs. Starting over anywhere else means teaching it all again, from zero.
          </p>

          {/* component bars */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {components.map((c) => (
              <div key={c.label}>
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="text-[12px] font-medium text-on-dark">{c.label}</span>
                  <span className="font-mono text-[10.5px] text-on-dark-mute">{c.points}/{c.max}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-charcoal-soft">
                  <div className="h-full rounded-full bg-sweep-light" style={{ width: `${(c.points / c.max) * 100}%` }} />
                </div>
                <p className="m-0 mt-0.5 text-[10.5px] text-on-dark-mute">{c.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ROI ledger — the number that only grows */}
      <div className="mt-6 grid grid-cols-2 gap-3 border-t border-charcoal-line pt-5 sm:grid-cols-4">
        <Ledger value={formatMoney(ledger.recoveredCents)} label="recovered all-time" accent />
        <Ledger value={`${formatMoney(ledger.perMonthCents)}/mo`} label="run-rate" />
        <Ledger value={ledger.leadsReactivated.toLocaleString("en-US")} label="leads reactivated" />
        <Ledger value={`${ledger.daysActive}d`} label="on the job" />
      </div>
    </div>
  );
}

function Ledger({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <div>
      <p className={`m-0 font-heading text-[22px] font-semibold tabular-nums ${accent ? "text-sweep-light" : "text-white"}`}>{value}</p>
      <p className="m-0 text-[11.5px] text-on-dark-mute">{label}</p>
    </div>
  );
}
