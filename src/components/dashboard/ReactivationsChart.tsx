"use client";

import { useState } from "react";
import type { ChartBar } from "@/lib/metrics";

/**
 * Reactivations bar chart — the dashboard's data-viz centerpiece. Interactive
 * (hover any column for an exact read), with calm gridlines, grow-in bars, and
 * the current day called out so "today so far" is always legible. Pure
 * presentation over the server-computed ChartBar[]; no data fetching here.
 */
export function ReactivationsChart({ bars }: { bars: ChartBar[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...bars.map((b) => b.value));
  const total = bars.reduce((s, b) => s + b.value, 0);
  // A clean y-axis ceiling (1,2,3,5,10…) so gridlines land on round numbers.
  const ceil = niceCeil(max);
  const ticks = gridTicks(ceil);
  const PLOT = 150; // px plotting height

  return (
    <div className="rounded-xl2 border border-line bg-white p-6 shadow-card">
      <div className="mb-5 flex items-baseline justify-between">
        <div>
          <p className="m-0 font-heading text-[16px] font-semibold text-ink">Reactivations</p>
          <p className="m-0 mt-0.5 text-[12.5px] text-muted-2">last 7 days · calls booked</p>
        </div>
        <p className="m-0 font-heading text-[15px] font-semibold tabular-nums text-sweep">
          {total} <span className="text-[12px] font-medium text-muted-3">this week</span>
        </p>
      </div>

      <div className="flex gap-3">
        {/* y-axis ticks */}
        <div className="relative w-5 flex-none" style={{ height: PLOT }}>
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute right-0 -translate-y-1/2 text-[10px] tabular-nums text-muted-3"
              style={{ bottom: `${(t / ceil) * PLOT}px` }}
            >
              {t}
            </span>
          ))}
        </div>

        {/* plot */}
        <div className="relative flex-1">
          {/* gridlines */}
          <div className="absolute inset-x-0 top-0" style={{ height: PLOT }}>
            {ticks.map((t) => (
              <span
                key={t}
                className="absolute inset-x-0 border-t border-line-2"
                style={{ bottom: `${(t / ceil) * PLOT}px` }}
              />
            ))}
          </div>

          {/* bars */}
          <div className="relative flex items-end gap-3" style={{ height: PLOT }}>
            {bars.map((b, i) => {
              const today = i === bars.length - 1;
              const on = hover === i;
              const h = b.value > 0 ? Math.max(6, (b.value / ceil) * PLOT) : 3;
              return (
                <div
                  key={i}
                  className="group relative flex h-full flex-1 cursor-default items-end"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                >
                  {/* tooltip */}
                  {on && (
                    <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-charcoal px-2.5 py-1.5 text-center shadow-pop">
                      <p className="m-0 font-heading text-[13px] font-semibold leading-none text-white">{b.value}</p>
                      <p className="m-0 mt-1 text-[10px] leading-none text-on-dark-mute">booked {today ? "today" : b.day}</p>
                    </div>
                  )}
                  <div
                    className={`w-full origin-bottom animate-wsGrow rounded-t-md transition-colors ${
                      b.value === 0
                        ? "bg-line-3/60"
                        : on
                          ? "bg-sweep"
                          : today
                            ? "bg-sweep"
                            : "bg-sweep/80 group-hover:bg-sweep"
                    } ${today && b.value > 0 ? "ring-2 ring-sweep/25 ring-offset-1 ring-offset-white" : ""}`}
                    style={{ height: `${h}px` }}
                  />
                </div>
              );
            })}
          </div>

          {/* x-axis labels */}
          <div className="mt-2 flex gap-3">
            {bars.map((b, i) => {
              const today = i === bars.length - 1;
              return (
                <span
                  key={i}
                  className={`flex-1 text-center text-[11.5px] ${today ? "font-semibold text-ink-soft" : "text-muted-3"}`}
                >
                  {today ? "Today" : b.day}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// Round a max up to a friendly ceiling so gridlines/ticks read cleanly.
function niceCeil(n: number): number {
  if (n <= 1) return 1;
  if (n <= 2) return 2;
  if (n <= 3) return 3;
  if (n <= 5) return 5;
  if (n <= 10) return 10;
  return Math.ceil(n / 5) * 5;
}

// Up to ~4 evenly spaced ticks including the ceiling, skipping 0 (baseline).
function gridTicks(ceil: number): number[] {
  const step = ceil <= 3 ? 1 : ceil <= 5 ? 1 : ceil / (ceil % 4 === 0 ? 4 : ceil % 3 === 0 ? 3 : 2);
  const out: number[] = [];
  for (let t = step; t <= ceil + 0.001; t += step) out.push(Math.round(t));
  return Array.from(new Set(out));
}
