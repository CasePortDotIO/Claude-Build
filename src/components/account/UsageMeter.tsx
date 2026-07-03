/**
 * Monthly processing meter — shows how many fresh leads the agent has worked
 * this billing period against the plan's fair-use volume. Framed as headroom,
 * not a cage: it's an upsell/awareness surface, and only appears once billing is
 * live (the meter is inactive in dev). Server component, pure props.
 */
export interface UsageVM {
  used: number;
  soft: number; // fair-use ceiling shown to the user
  overSoft: boolean;
  atHardCap: boolean;
  planLabel: string;
}

export function UsageMeter({ usage }: { usage: UsageVM }) {
  const pct = usage.soft > 0 ? Math.min(100, Math.round((usage.used / usage.soft) * 100)) : 0;
  const barColor = usage.atHardCap ? "bg-ember" : usage.overSoft ? "bg-[#d98b3b]" : "bg-sweep";

  return (
    <div className="mt-6 rounded-xl2 border border-line bg-white p-6 shadow-card">
      <div className="flex items-baseline justify-between gap-3">
        <p className="m-0 font-heading text-[16px] font-semibold text-ink">This month&apos;s processing</p>
        <span className="text-[12.5px] font-medium text-muted-2">{usage.planLabel}</span>
      </div>
      <p className="m-0 mt-1 mb-3 text-[13px] text-muted">
        Fresh leads your agent has revived this billing period.
      </p>

      <div className="mb-2 flex items-baseline justify-between">
        <span className="font-heading text-[22px] font-semibold tabular-nums text-ink">
          {usage.used.toLocaleString()}
          <span className="ml-1 text-[13px] font-medium text-muted-2">/ {usage.soft.toLocaleString()}</span>
        </span>
        <span className="text-[12.5px] text-muted-2">{pct}%</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-line-2">
        <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${Math.max(2, pct)}%` }} />
      </div>

      {usage.atHardCap ? (
        <p className="m-0 mt-3 text-[12.5px] font-medium text-ember">
          You&apos;ve reached this month&apos;s volume — it resets at the start of next month, or upgrade to keep the agent working now.
        </p>
      ) : usage.overSoft ? (
        <p className="m-0 mt-3 text-[12.5px] text-muted">
          You&apos;re working at full tilt this month — you have some headroom left, and it resets next month.
        </p>
      ) : (
        <p className="m-0 mt-3 text-[12.5px] text-muted-2">Plenty of runway left this month.</p>
      )}
    </div>
  );
}
