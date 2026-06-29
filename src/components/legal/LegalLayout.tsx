import Link from "next/link";

/**
 * Public, unauthenticated shell for legal pages (privacy, terms). Lives outside
 * the (app) group so it renders without requireOrg(). Calm, readable prose on the
 * brand parchment, with a wordmark that links home.
 */
export function LegalLayout({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-parchment">
      <header className="border-b border-line bg-[rgba(250,247,242,0.9)] px-6 py-4 backdrop-blur-md">
        <Link href="/" className="inline-flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-sweep font-heading text-[15px] font-bold text-white">◎</span>
          <span className="font-heading text-[15px] font-semibold text-ink">The Warm Sweep&trade;</span>
        </Link>
      </header>
      <main className="mx-auto max-w-[760px] px-6 py-12">
        <h1 className="m-0 mb-2 font-heading text-[30px] font-semibold tracking-[-0.6px] text-ink">{title}</h1>
        <p className="m-0 mb-8 text-[13px] text-muted-2">Last updated: {updated}</p>
        <div className="legal-prose flex flex-col gap-5 text-[14.5px] leading-[1.65] text-ink-soft">{children}</div>
        <footer className="mt-14 border-t border-line pt-6 text-[13px] text-muted-2">
          <Link href="/privacy" className="font-semibold text-sweep hover:underline">Privacy</Link>
          <span className="mx-2">·</span>
          <Link href="/terms" className="font-semibold text-sweep hover:underline">Terms</Link>
          <span className="mx-2">·</span>
          <Link href="/" className="hover:underline">Home</Link>
        </footer>
      </main>
    </div>
  );
}

export function LegalSection({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="m-0 mt-3 font-heading text-[18px] font-semibold text-ink">{heading}</h2>
      {children}
    </section>
  );
}
