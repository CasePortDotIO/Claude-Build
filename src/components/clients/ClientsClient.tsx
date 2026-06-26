"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClientAction, updateClientBrandingAction, switchOrgAction } from "@/server/actions/org";

export interface ClientVM {
  orgId: string;
  name: string;
  brandName: string | null;
  brandColor: string | null;
  recovered: string;
  calls: number;
  replyRate: number;
  leadCount: number;
  price: string;
  priceCents: number;
  billingStatus: string;
}

function initials(name: string) {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

export function ClientsClient({ clients }: { clients: ClientVM[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [brand, setBrand] = useState<{ brandName: string; brandColor: string; fromDomain: string }>({ brandName: "", brandColor: "", fromDomain: "" });

  function run(fn: () => Promise<{ ok: boolean; message?: string; error?: string }>, after?: () => void) {
    startTransition(async () => {
      const r = await fn();
      setMsg(r.ok ? r.message ?? "Done" : r.error ?? "Error");
      if (r.ok) after?.();
      router.refresh();
      setTimeout(() => setMsg(null), 4000);
    });
  }

  return (
    <div>
      {msg && <div className="mb-4 rounded-lg bg-sweep-mist px-3 py-2 text-[13px] text-sweep">{msg}</div>}

      <div className="mb-4 flex items-center justify-between">
        <p className="m-0 text-[12px] font-semibold uppercase tracking-[1.6px] text-muted-2">Your clients · {clients.length}</p>
        <button onClick={() => setAdding((v) => !v)} className="rounded-lg bg-ember px-4 py-2 font-heading text-[13px] font-semibold text-white hover:bg-ember-hover">
          {adding ? "Cancel" : "+ Add client"}
        </button>
      </div>

      {adding && (
        <div className="mb-4 rounded-xl2 border border-line bg-white p-5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-[12px] font-semibold text-ink">Client / brand name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Apex Fitness Studio" className="w-full rounded-lg border border-line-3 bg-white px-3 py-2 text-[13.5px] outline-none focus:border-sweep" />
            </div>
            <div className="w-[140px]">
              <label className="mb-1 block text-[12px] font-semibold text-ink">Your price ($/mo)</label>
              <input value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9]/g, ""))} placeholder="497" className="w-full rounded-lg border border-line-3 bg-white px-3 py-2 text-[13.5px] outline-none focus:border-sweep" />
            </div>
            <button
              disabled={pending || !name}
              onClick={() => run(() => createClientAction({ name, brandName: name, clientPriceCents: (Number(price) || 0) * 100 }), () => { setAdding(false); setName(""); setPrice(""); })}
              className="rounded-lg bg-sweep px-4 py-2 font-heading text-[13.5px] font-semibold text-white hover:opacity-90 disabled:opacity-60"
            >
              Create client
            </button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl2 border border-line bg-white">
        <div className="grid grid-cols-[1.5fr_1fr_0.7fr_0.7fr_0.8fr] gap-3 border-b border-line-2 bg-cream-head px-[22px] py-3.5">
          {["Client", "Recovered", "Calls", "Leads", "Status"].map((h) => (
            <span key={h} className="text-[11px] font-semibold uppercase tracking-[0.8px] text-muted-3">{h}</span>
          ))}
        </div>
        {clients.length === 0 ? (
          <p className="m-0 px-[22px] py-8 text-center text-[14px] text-muted">No clients yet. Add your first client to start the roll-up.</p>
        ) : (
          clients.map((c) => (
            <div key={c.orgId} className="border-b border-line-2 last:border-b-0">
              <div className="grid grid-cols-[1.5fr_1fr_0.7fr_0.7fr_0.8fr] items-center gap-3 px-[22px] py-3.5">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-lg font-heading text-[13px] font-semibold text-white" style={{ background: c.brandColor || "#2A4D8F" }}>
                    {initials(c.brandName || c.name)}
                  </div>
                  <span className="truncate text-[14px] font-semibold text-ink">{c.brandName || c.name}</span>
                </div>
                <span className="text-[14.5px] font-semibold text-sweep tabular-nums">{c.recovered}</span>
                <span className="text-[14px] text-ink-soft tabular-nums">{c.calls}</span>
                <span className="text-[14px] text-ink-soft tabular-nums">{c.leadCount}</span>
                <div className="flex items-center gap-2">
                  <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${c.billingStatus === "active" ? "bg-[rgba(27,122,87,0.08)] text-sweep" : "bg-line-2 text-muted-2"}`}>{c.billingStatus}</span>
                </div>
              </div>
              <div className="flex items-center gap-3 px-[22px] pb-3">
                <button
                  onClick={() => run(() => switchOrgAction(c.orgId), () => router.push("/"))}
                  className="text-[12px] font-semibold text-sweep hover:underline"
                >
                  Open workspace →
                </button>
                <button onClick={() => { setEditing(editing === c.orgId ? null : c.orgId); setBrand({ brandName: c.brandName ?? "", brandColor: c.brandColor ?? "", fromDomain: "" }); }} className="text-[12px] font-semibold text-muted hover:underline">
                  {editing === c.orgId ? "Close" : "White-label"}
                </button>
                <span className="ml-auto text-[12px] text-muted-3">{c.price}/mo</span>
              </div>
              {editing === c.orgId && (
                <div className="border-t border-line-2 bg-cream px-[22px] py-3.5">
                  <div className="flex flex-wrap items-end gap-3">
                    <Field label="Brand name" value={brand.brandName} onChange={(v) => setBrand((b) => ({ ...b, brandName: v }))} />
                    <Field label="Brand color" value={brand.brandColor} onChange={(v) => setBrand((b) => ({ ...b, brandColor: v }))} placeholder="#1B7A57" w="120px" />
                    <Field label="From domain" value={brand.fromDomain} onChange={(v) => setBrand((b) => ({ ...b, fromDomain: v }))} placeholder="mail.client.com" />
                    <button
                      disabled={pending}
                      onClick={() => run(() => updateClientBrandingAction({ orgId: c.orgId, ...brand }), () => setEditing(null))}
                      className="rounded-lg bg-sweep px-4 py-2 text-[12.5px] font-semibold text-white hover:opacity-90 disabled:opacity-60"
                    >
                      Save branding
                    </button>
                  </div>
                  <p className="m-0 mt-2 text-[11.5px] text-muted-3">Clients see this brand — never “The Warm Sweep”.</p>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, w }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; w?: string }) {
  return (
    <div style={{ width: w }} className={w ? "" : "flex-1"}>
      <label className="mb-1 block text-[12px] font-semibold text-ink">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full rounded-lg border border-line-3 bg-white px-3 py-2 text-[13.5px] outline-none focus:border-sweep" />
    </div>
  );
}
