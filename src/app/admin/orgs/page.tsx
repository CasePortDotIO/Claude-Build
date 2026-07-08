import Link from "next/link";
import { listOrgsForAdmin } from "@/lib/admin/orgs";
import { AdminOrgRow } from "@/components/admin/AdminOrgRow";

export const dynamic = "force-dynamic";

export default async function AdminOrgsPage() {
  const orgs = await listOrgsForAdmin();
  const paying = orgs.filter((o) => o.billingStatus === "active" || o.billingStatus === "trial").length;

  return (
    <div className="mx-auto max-w-[980px] px-5 py-10 sm:px-8">
      <div className="mb-2 flex items-center justify-between">
        <p className="m-0 text-[12px] font-semibold uppercase tracking-[1.4px] text-muted-2">Platform · Workspaces</p>
        <Link href="/admin" className="text-[12.5px] font-semibold text-muted hover:text-ink">← Admin</Link>
      </div>
      <h1 className="m-0 mb-1 font-heading text-[26px] font-semibold tracking-[-0.5px] text-ink">Workspaces</h1>
      <p className="m-0 mb-6 text-[13px] text-muted">{orgs.length} total · {paying} with access</p>

      {orgs.length === 0 ? (
        <p className="text-[13.5px] text-muted">No workspaces yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {orgs.map((o) => (
            <AdminOrgRow key={o.id} org={o} />
          ))}
        </div>
      )}

      <p className="mt-6 text-[12px] text-muted-3">
        Refund obligations are surfaced here but never auto-issued — handle the refund in Stripe, then clear any owed credits.
      </p>
    </div>
  );
}
