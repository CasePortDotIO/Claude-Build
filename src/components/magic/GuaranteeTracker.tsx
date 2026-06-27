import type { GuaranteeStatus } from "@/lib/guarantee";

/**
 * §8 guarantee tracker. The offer is "book at least X calls in 30 days or you
 * don't pay" — so the progress toward X has to be a fact on the screen, not an
 * argument at refund time. The threshold comes from lib/guarantee.ts (one place).
 */
export function GuaranteeTracker({ status }: { status: GuaranteeStatus }) {
  const { booked, threshold, met, remaining, progressPct, windowDays } = status;
  return (
    <div className={`rounded-xl2 border p-5 ${met ? "border-[rgba(27,122,87,0.25)] bg-sweep-mist" : "border-line bg-white"}`}>
      <div className="mb-3 flex items-center justify-between">
        <p className="m-0 text-[12px] font-semibold uppercase tracking-[1.6px] text-muted-2">
          30-day guarantee
        </p>
        {met ? (
          <span className="flex items-center gap-1.5 rounded-full bg-sweep px-2.5 py-1 text-[11.5px] font-semibold text-white">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
            Met
          </span>
        ) : (
          <span className="rounded-full bg-cream px-2.5 py-1 text-[11.5px] font-semibold text-muted">In progress</span>
        )}
      </div>

      <p className="m-0 mb-1 font-heading text-[28px] font-semibold tabular-nums text-ink">
        {booked} <span className="text-[18px] font-medium text-muted-2">/ {threshold} calls booked</span>
      </p>
      <p className="m-0 mb-3 text-[12.5px] text-muted-2">
        {met
          ? `Guarantee met — ${booked - threshold >= 0 ? booked : threshold} booked this window.`
          : `${remaining} more booked call${remaining === 1 ? "" : "s"} in the next ${windowDays} days to hit your guarantee.`}
      </p>

      <div className="h-2 overflow-hidden rounded-full bg-line-2">
        <div className={`h-full rounded-full ${met ? "bg-sweep" : "bg-ember"}`} style={{ width: `${progressPct}%` }} />
      </div>
      <p className="m-0 mt-2 text-[11px] text-muted-3">Rolling {windowDays}-day window · counts every confirmed booking</p>
    </div>
  );
}
