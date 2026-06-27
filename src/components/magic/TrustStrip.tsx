/**
 * The confidence strip. For a coach, letting an agent email their own past
 * clients in their name is the scary part — so we say the quiet part out loud,
 * early and often: nothing sends without you, secrets stay server-side, and we
 * only ever touch prior contacts. Shown on the first-run flow + the import wizard.
 */
const ITEMS: { title: string; sub: string; icon: React.ReactNode }[] = [
  {
    title: "Nothing sends without you",
    sub: "Every email waits for your one-click approval",
    icon: (
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4L12 14.01l-3-3" />
    ),
  },
  {
    title: "Your keys never touch the browser",
    sub: "Mailbox tokens are encrypted at rest, server-side only",
    icon: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  },
  {
    title: "Prior contacts only",
    sub: "Reactivation, never cold outreach — enforced at import",
    icon: (
      <>
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
  },
];

export function TrustStrip({ className = "" }: { className?: string }) {
  return (
    <div className={`grid grid-cols-1 gap-3 sm:grid-cols-3 ${className}`}>
      {ITEMS.map((it) => (
        <div key={it.title} className="flex items-start gap-3 rounded-xl2 border border-line bg-white px-4 py-3.5">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#1B7A57"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mt-0.5 flex-none"
          >
            {it.icon}
          </svg>
          <div className="min-w-0">
            <p className="m-0 text-[13px] font-semibold text-ink">{it.title}</p>
            <p className="m-0 text-[12px] leading-[1.45] text-muted-2">{it.sub}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
