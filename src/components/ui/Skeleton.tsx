/**
 * Skeleton primitives — calm, theme-matched placeholders shown while data loads.
 * One source of truth so every loading.tsx and inline skeleton looks identical
 * (same pulse, same cream tone, same radius). Pure presentational, no client JS.
 */
import type { CSSProperties } from "react";

const TONE = "#ece6da"; // cream skeleton fill, matches the app loading shell

export function Skeleton({
  className = "",
  style,
  delayMs,
}: {
  className?: string;
  style?: CSSProperties;
  delayMs?: number;
}) {
  return (
    <div
      className={`animate-pulse rounded-md ${className}`}
      style={{ backgroundColor: TONE, ...(delayMs ? { animationDelay: `${delayMs}ms` } : {}), ...style }}
    />
  );
}

/** A stack of text lines; the last line is shorter for a natural ragged edge. */
export function SkeletonText({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-3.5"
          delayMs={i * 60}
          style={{ width: i === lines - 1 ? "62%" : "100%" }}
        />
      ))}
    </div>
  );
}

/** Placeholder rows for a list/table while it loads. */
export function SkeletonRows({ rows = 5, className = "" }: { rows?: number; className?: string }) {
  return (
    <div className={`flex flex-col gap-2.5 ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center justify-between gap-3 rounded-lg border border-line bg-white px-3.5 py-3"
          style={{ animationDelay: `${i * 60}ms` }}
        >
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <Skeleton className="h-8 w-8 flex-none rounded-full" delayMs={i * 60} />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Skeleton className="h-3.5 w-1/3" delayMs={i * 60} />
              <Skeleton className="h-3 w-2/3" delayMs={i * 60 + 30} />
            </div>
          </div>
          <Skeleton className="h-8 w-20 flex-none rounded-lg" delayMs={i * 60} />
        </div>
      ))}
    </div>
  );
}

/** A card-shaped block (KPIs, panels). */
export function SkeletonCard({ className = "", delayMs }: { className?: string; delayMs?: number }) {
  return <Skeleton className={`rounded-xl2 ${className}`} delayMs={delayMs} />;
}
