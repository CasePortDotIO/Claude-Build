"use client";

import { useEffect, useRef, useState } from "react";
import { formatMoney } from "@/lib/format";

/**
 * Animated count-up for the "dormant pipeline" reveal + booking celebration.
 * Eases a number from 0 to its target over ~1.1s so the money lands with weight
 * instead of just appearing. Respects prefers-reduced-motion (jumps straight to
 * the value). `money` formats the target as USD; otherwise it's a plain integer.
 */
export function CountUp({
  to,
  money = false,
  durationMs = 1100,
  className,
}: {
  to: number;
  money?: boolean;
  durationMs?: number;
  className?: string;
}) {
  const [value, setValue] = useState(0);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || to <= 0) {
      setValue(to);
      return;
    }
    let startTs: number | null = null;
    const tick = (ts: number) => {
      if (startTs === null) startTs = ts;
      const t = Math.min(1, (ts - startTs) / durationMs);
      // easeOutCubic — fast then settles.
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(to * eased);
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [to, durationMs]);

  const display = money ? formatMoney(Math.round(value)) : Math.round(value).toLocaleString("en-US");
  return <span className={className}>{display}</span>;
}
