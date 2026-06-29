import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-6">
      <div className="ws-rise max-w-[420px] rounded-xl2 border border-line bg-white p-8 text-center shadow-card">
        <p className="m-0 mb-1 font-heading text-[40px] font-semibold tracking-[-1px] text-sweep">404</p>
        <h1 className="m-0 mb-1.5 font-heading text-[19px] font-semibold text-ink">Page not found</h1>
        <p className="m-0 mb-5 text-[13.5px] leading-[1.55] text-muted">That page doesn&apos;t exist or moved. Let&apos;s get you back on track.</p>
        <Link href="/" className="inline-block rounded-lg bg-sweep px-5 py-2.5 text-[13.5px] font-semibold text-white hover:opacity-90">Back to dashboard</Link>
      </div>
    </div>
  );
}
