/**
 * Split-screen auth shell. On large screens, a charcoal brand/value panel sits
 * beside the form — the first impression of the product, pre-login. On mobile it
 * collapses to just the form (which carries its own compact wordmark).
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      {/* ── Brand / value panel (desktop only) ───────────────────────────── */}
      <aside className="relative hidden w-[46%] flex-col justify-between overflow-hidden bg-charcoal px-12 py-12 lg:flex xl:px-16">
        {/* soft brand glow */}
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full opacity-30 blur-3xl"
          style={{ background: "radial-gradient(circle, #5CA98A 0%, transparent 70%)" }}
        />
        <div
          className="pointer-events-none absolute -bottom-32 -left-16 h-80 w-80 rounded-full opacity-20 blur-3xl"
          style={{ background: "radial-gradient(circle, #E8743B 0%, transparent 70%)" }}
        />

        <div className="relative">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-sweep-light font-heading text-[17px] font-bold text-charcoal">
              ◎
            </span>
            <span className="font-heading text-[16px] font-semibold text-on-dark">The Warm Sweep&trade;</span>
          </div>
        </div>

        <div className="relative max-w-[460px]">
          <p className="m-0 mb-3 font-heading text-[13px] font-semibold uppercase tracking-[2px] text-sweep-light">
            Coach. Don&apos;t chase.
          </p>
          <h2 className="m-0 mb-5 font-heading text-[34px] font-semibold leading-[1.18] tracking-[-0.8px] text-white xl:text-[40px]">
            Turn cold leads into booked calls — without chasing.
          </h2>
          <p className="m-0 mb-8 text-[15px] leading-[1.6] text-on-dark-soft">
            Your AI revives dead leads, writes in your voice, handles the replies, and books the call straight to your
            calendar. You just approve.
          </p>
          <ul className="m-0 flex list-none flex-col gap-3.5 p-0">
            {[
              "Writes & replies in your own voice",
              "Books the call straight to your calendar",
              "Every email waits for your approval",
            ].map((t) => (
              <li key={t} className="flex items-center gap-3 text-[14.5px] text-on-dark">
                <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-sweep-light/15 text-sweep-light">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex items-center gap-3 rounded-xl2 border border-charcoal-line bg-charcoal-soft px-4 py-3.5">
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-sweep-light/15 font-heading text-[15px] font-bold text-sweep-light">
            30%
          </span>
          <p className="m-0 text-[13px] leading-[1.45] text-on-dark-soft">
            Built to recover up to <span className="font-semibold text-on-dark">30% of cold leads</span> — revenue you
            already earned, back on the calendar.
          </p>
        </div>
      </aside>

      {/* ── Form side ────────────────────────────────────────────────────── */}
      <main className="relative flex w-full flex-1 items-center justify-center bg-parchment px-6 py-12">
        {children}
        <p className="absolute bottom-5 left-0 right-0 text-center text-[12px] text-muted-2">
          <a href="/privacy" className="hover:text-sweep hover:underline">Privacy</a>
          <span className="mx-2">·</span>
          <a href="/terms" className="hover:text-sweep hover:underline">Terms</a>
        </p>
      </main>
    </div>
  );
}
