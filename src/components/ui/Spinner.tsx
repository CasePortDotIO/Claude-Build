/**
 * Inline spinner — small motion feedback for in-progress actions, so a busy
 * button reads as "working" rather than just dimmed. `currentColor` inherits the
 * button's text color, so it works on both light and dark buttons unchanged.
 */
export function Spinner({ className = "", size = 14 }: { className?: string; size?: number }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      role="status"
      aria-label="Loading"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** A label preceded by a spinner — the canonical "busy button" content. */
export function SpinnerLabel({ children, size = 14 }: { children: React.ReactNode; size?: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Spinner size={size} />
      {children}
    </span>
  );
}
