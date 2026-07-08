import Link from "next/link";

export const dynamic = "force-dynamic";

/** Platform admin home — superadmin-gated by the layout. */
export default function AdminHome() {
  return (
    <div className="mx-auto max-w-[860px] px-5 py-10 sm:px-8">
      <div className="mb-2 flex items-center justify-between">
        <p className="m-0 text-[12px] font-semibold uppercase tracking-[1.4px] text-muted-2">Platform</p>
        <Link href="/" className="text-[12.5px] font-semibold text-muted hover:text-ink">← Back to app</Link>
      </div>
      <h1 className="m-0 mb-6 font-heading text-[26px] font-semibold tracking-[-0.5px] text-ink">Admin</h1>
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <AdminCard
          href="/admin/readiness"
          title="Go-Live Readiness"
          desc="Live check of every launch requirement — Stripe, email, OAuth, AI, crons, and per-workspace setup."
        />
        <AdminCard
          href="/admin/orgs"
          title="Workspaces"
          desc="Every workspace's tier, billing, usage, trial progress, and guarantee obligations — with comp / suspend / tier controls."
        />
      </div>
    </div>
  );
}

function AdminCard({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <Link href={href} className="rounded-xl2 border border-line bg-white p-5 shadow-card transition-shadow hover:shadow-pop">
      <p className="m-0 mb-1 font-heading text-[15.5px] font-semibold text-ink">{title}</p>
      <p className="m-0 text-[12.5px] leading-[1.5] text-muted">{desc}</p>
    </Link>
  );
}
