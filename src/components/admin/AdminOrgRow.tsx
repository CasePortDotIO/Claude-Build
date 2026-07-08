"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toastResult } from "@/components/ui/Toast";
import {
  setTierAction,
  grantAccessAction,
  suspendAction,
  restoreAction,
  resetMeterAction,
  clearGuaranteeCreditAction,
  type AdminResult,
} from "@/server/actions/admin";
import type { AdminOrgVM } from "@/lib/admin/orgs";

const TIERS = ["AUTO", "NONE", "TRIAL", "FRONT_END", "OTO1", "CONTINUITY", "PERFORMANCE", "RESELLER", "AGENCY"];

export function AdminOrgRow({ org }: { org: AdminOrgVM }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function run(fn: () => Promise<AdminResult>) {
    start(async () => {
      toastResult(await fn());
      router.refresh();
    });
  }

  const suspended = org.billingStatus === "paused";
  const infinite = (n: number) => (n === Number.POSITIVE_INFINITY ? "∞" : n.toLocaleString());

  return (
    <div className="rounded-xl2 border border-line bg-white p-4 shadow-card">
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <span className="font-heading text-[14.5px] font-semibold text-ink">{org.name}</span>
        <Badge tone="ink">{org.type}</Badge>
        <Badge tone="sweep">{org.tier}{org.planTierRaw ? "" : " (auto)"}</Badge>
        <Badge tone={org.billingStatus === "active" || org.billingStatus === "trial" ? "green" : "red"}>{org.billingStatus}</Badge>
        {org.trial.active && <Badge tone="ember">trial {org.trial.booked}/{org.trial.threshold ?? "—"} calls</Badge>}
        {org.guarantee.creditMonths > 0 && <Badge tone="ember">{org.guarantee.creditMonths} free-month owed</Badge>}
        {org.guarantee.refundDue > 0 && <Badge tone="red">{org.guarantee.refundDue} refund due</Badge>}
        {!org.hasMailingAddress && <Badge tone="red">no mailing address</Badge>}
        {!org.hasRealMailbox && <Badge tone="red">no inbox</Badge>}
      </div>

      <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-muted">
        <span>Meter: <span className={`font-semibold ${org.meter.atHardCap ? "text-[#b43c3c]" : org.meter.overSoft ? "text-ember" : "text-ink"}`}>{org.meter.used.toLocaleString()}</span> / {infinite(org.meter.soft)} soft · {infinite(org.meter.hard)} hard</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-[12px] text-muted">
          Tier
          <select
            defaultValue={org.planTierRaw ?? "AUTO"}
            disabled={pending}
            onChange={(e) => run(() => setTierAction(org.id, e.target.value))}
            className="rounded-lg border border-line-3 bg-white px-2 py-1 text-[12.5px] outline-none focus:border-sweep"
          >
            {TIERS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>

        <Btn disabled={pending} onClick={() => run(() => grantAccessAction(org.id))}>Comp access</Btn>
        {suspended ? (
          <Btn disabled={pending} tone="sweep" onClick={() => run(() => restoreAction(org.id))}>Restore</Btn>
        ) : (
          <Btn disabled={pending} tone="red" onClick={() => run(() => suspendAction(org.id))}>Suspend</Btn>
        )}
        <Btn disabled={pending} onClick={() => run(() => resetMeterAction(org.id))}>Reset meter</Btn>
        {org.guarantee.creditMonths > 0 && (
          <Btn disabled={pending} onClick={() => run(() => clearGuaranteeCreditAction(org.id))}>Clear credits</Btn>
        )}
      </div>
    </div>
  );
}

function Btn({ children, onClick, disabled, tone }: { children: React.ReactNode; onClick: () => void; disabled: boolean; tone?: "sweep" | "red" }) {
  const cls =
    tone === "sweep"
      ? "border-sweep text-sweep hover:bg-sweep hover:text-white"
      : tone === "red"
        ? "border-[#e3b7b7] text-[#b43c3c] hover:bg-[#b43c3c] hover:text-white"
        : "border-line-3 text-muted hover:bg-cream";
  return (
    <button onClick={onClick} disabled={disabled} className={`rounded-lg border px-2.5 py-1 text-[12px] font-semibold disabled:opacity-50 ${cls}`}>
      {children}
    </button>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: "ink" | "sweep" | "green" | "red" | "ember" }) {
  const map = {
    ink: "bg-cream text-muted",
    sweep: "bg-sweep-mist text-sweep",
    green: "bg-sweep-mist text-sweep",
    red: "bg-[#f7dede] text-[#b43c3c]",
    ember: "bg-[#fbf0ec] text-[#a14a2c]",
  } as const;
  return <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${map[tone]}`}>{children}</span>;
}
