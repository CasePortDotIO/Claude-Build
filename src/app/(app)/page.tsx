import Link from "next/link";
import { requireOrg } from "@/lib/auth-helpers";
import { orgScoped } from "@/lib/tenancy";
import { Topbar } from "@/components/nav/Topbar";

// Command Center — M1 shows real lead counts from imports. The KPI row,
// reactivations chart, activity feed, and "agent updated itself" card are
// wired with live data in M4; here they're honest placeholders.
export default async function CommandCenter() {
  const ctx = await requireOrg();
  const db = orgScoped(ctx.orgId);

  const [total, awaiting, imports] = await Promise.all([
    db.lead.count(),
    db.lead.count({ where: { status: "NEW" } }),
    db.leadImport.findMany({ orderBy: { createdAt: "desc" }, take: 1 }),
  ]);
  const lastImport = imports[0];

  return (
    <>
      <Topbar title="Command Center" />
      <div className="ws-rise flex-1 px-[34px] pb-[60px] pt-[30px]">
        {/* KPI row */}
        <div className="mb-[22px] grid grid-cols-1 gap-[18px] md:grid-cols-2 xl:grid-cols-4">
          <div className="relative overflow-hidden rounded-xl2 bg-sweep p-[22px] text-white">
            <p className="m-0 mb-3 text-[12.5px] font-medium text-[#bfe6d5]">Leads in your sweep</p>
            <p className="m-0 mb-2 font-heading text-[34px] font-semibold tracking-[-1px] tabular-nums">{total}</p>
            <p className="m-0 text-[12.5px] text-[#bfe6d5]">imported &amp; ready to work</p>
          </div>
          <KpiCard label="Awaiting first touch" value={awaiting} sub="will be drafted in M2" />
          <KpiCard label="Calls booked" value={0} sub="booking lands in M4" />
          <KpiCard label="Reply rate" value="—" sub="sending lands in M3" />
        </div>

        {/* Milestone honesty card */}
        <div className="mb-[22px] overflow-hidden rounded-xl2 bg-charcoal p-[26px] px-7">
          <div className="mb-4 flex items-center gap-2.5">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5CA98A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8" />
              <circle cx="12" cy="12" r="3.2" />
            </svg>
            <p className="m-0 font-sans text-[12px] font-semibold uppercase tracking-[1.8px] text-sweep-light">
              Milestone 1 · foundation shipped
            </p>
          </div>
          <p className="m-0 mb-[18px] max-w-[760px] font-heading text-[20px] font-medium leading-[1.4] text-white">
            Multi-tenant workspace, auth, and CSV import are live. Your leads are scoped to this org and ready.
            Next, the agent learns your <span className="text-sweep-light">voice</span> and drafts re-engagement
            emails grounded in real memory — for your approval.
          </p>
          <div className="flex flex-wrap gap-2.5">
            <Chip>per-org isolation enforced</Chip>
            <Chip>prior-contact gate on import</Chip>
            <Chip>{lastImport ? `last sweep: ${lastImport.name}` : "no sweeps yet"}</Chip>
            <Link
              href="/leads"
              className="ml-auto rounded-md bg-sweep-light px-3 py-1.5 text-[12.5px] font-semibold text-charcoal hover:bg-[#6dbd9b]"
            >
              View leads →
            </Link>
          </div>
        </div>

        {/* Always-on strip */}
        <div className="flex flex-wrap items-center gap-3.5 rounded-xl2 border border-line bg-white px-5 py-[15px]">
          <span className="inline-block h-[9px] w-[9px] flex-none animate-wsPulse rounded-full bg-sweep" />
          <p className="m-0 min-w-[220px] flex-1 text-[14px] leading-[1.5] text-ink-soft">
            {total > 0 ? (
              <>
                Your agent has <strong className="font-semibold text-ink">{total} prior contacts</strong> queued.
                Drafting begins once you connect a voice profile in Milestone 2.
              </>
            ) : (
              <>Import a CSV of prior leads to wake your agent up.</>
            )}
          </p>
          <Link
            href="/leads/import"
            className="flex-none rounded-lg bg-ember px-4 py-2.5 font-heading text-[13px] font-semibold text-white hover:bg-ember-hover"
          >
            {total > 0 ? "Add another list" : "Start a sweep"}
          </Link>
        </div>
      </div>
    </>
  );
}

function KpiCard({ label, value, sub }: { label: string; value: number | string; sub: string }) {
  return (
    <div className="rounded-xl2 border border-line bg-white p-[22px]">
      <p className="m-0 mb-3 text-[12.5px] font-medium text-[#888780]">{label}</p>
      <p className="m-0 mb-2 font-heading text-[34px] font-semibold tracking-[-1px] text-ink tabular-nums">{value}</p>
      <p className="m-0 text-[12.5px] text-[#888780]">{sub}</p>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md bg-charcoal-soft px-[11px] py-1.5 font-mono text-[12px] text-[#cdd2d6]">
      {children}
    </span>
  );
}
