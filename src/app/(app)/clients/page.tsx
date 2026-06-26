import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/auth-helpers";
import { Topbar } from "@/components/nav/Topbar";
import { agencyForUser, agencyRollup } from "@/lib/agency";
import { ClientsClient, type ClientVM } from "@/components/clients/ClientsClient";
import { formatMoney } from "@/lib/format";

// Reseller roll-up (§10). Only agency admins reach this; others are redirected.
export default async function ClientsPage() {
  const ctx = await requireOrg();
  // Authorization: must administer an agency (works from any active workspace).
  const agency = await agencyForUser(ctx.userId, ctx.orgId);
  if (!agency) redirect("/");

  const rollup = await agencyRollup(agency.id);
  const clientVMs: ClientVM[] = rollup.clients.map((c) => ({
    orgId: c.orgId,
    name: c.name,
    brandName: c.brandName,
    brandColor: c.brandColor,
    recovered: formatMoney(c.recoveredRevenueCents),
    calls: c.callsBooked,
    replyRate: c.replyRate,
    leadCount: c.leadCount,
    price: formatMoney(c.clientPriceCents),
    priceCents: c.clientPriceCents,
    billingStatus: c.billingStatus,
  }));

  return (
    <>
      <Topbar title="Clients" />
      <div className="ws-rise flex-1 px-[34px] pb-[60px] pt-[30px]">
        {/* reseller banner */}
        <div className="mb-[22px] flex items-center gap-3 rounded-xl2 border border-[#f0dcc9] bg-[#FBF3EC] px-5 py-3.5">
          <span className="flex-none rounded bg-ember px-[7px] py-[3px] text-[9px] font-bold uppercase tracking-[0.8px] text-white">Reseller</span>
          <p className="m-0 text-[13.5px] text-[#7a5a44]">
            White-label view — your clients see <strong className="font-semibold text-[#5a4030]">their own brand</strong>, never The Warm Sweep. Memory, suppression, and metrics stay isolated per client.
          </p>
        </div>

        {/* reseller KPIs */}
        <div className="mb-[22px] grid grid-cols-2 gap-[18px] md:grid-cols-4">
          <div className="rounded-xl2 bg-sweep p-[22px] text-white">
            <p className="m-0 mb-3 text-[12.5px] text-[#bfe6d5]">Your monthly margin</p>
            <p className="m-0 font-heading text-[30px] font-semibold tracking-[-1px] tabular-nums">{formatMoney(rollup.monthlyMarginCents)}</p>
          </div>
          <Kpi label="Active clients" value={rollup.clientCount} />
          <Kpi label="Recovered · all clients" value={formatMoney(rollup.totalRecoveredCents)} />
          <Kpi label="Calls booked · all clients" value={rollup.totalCalls} />
        </div>

        <ClientsClient clients={clientVMs} />
      </div>
    </>
  );
}

function Kpi({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl2 border border-line bg-white p-[22px]">
      <p className="m-0 mb-3 text-[12.5px] font-medium text-[#888780]">{label}</p>
      <p className="m-0 font-heading text-[30px] font-semibold tracking-[-1px] text-ink tabular-nums">{value}</p>
    </div>
  );
}
