"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { connectLeadSourceAction, disconnectLeadSourceAction, importFromSourceAction } from "@/server/actions/leadsource";
import type { LeadSourceKind } from "@prisma/client";
import { toastResult } from "@/components/ui/Toast";

interface SourceDef {
  provider: LeadSourceKind;
  name: string;
  desc: string;
  mono: string;
  color: string;
  fields: { key: string; label: string }[]; // config fields besides apiKey
}

const SOURCES: SourceDef[] = [
  { provider: "HUBSPOT", name: "HubSpot", desc: "Import contacts & past deals", mono: "HS", color: "#ff7a59", fields: [] },
  { provider: "MAILCHIMP", name: "Mailchimp", desc: "Pull old audiences & tags", mono: "MC", color: "#2c9ab7", fields: [{ key: "listId", label: "List ID" }, { key: "dc", label: "DC (e.g. us1)" }] },
  { provider: "KAJABI", name: "Kajabi", desc: "Sync members & leads", mono: "KJ", color: "#0d6efd", fields: [{ key: "subdomain", label: "Subdomain" }] },
  { provider: "GOOGLE_SHEETS", name: "Google Sheets", desc: "Map a sheet of leads", mono: "GS", color: "#0f9d58", fields: [{ key: "sheetId", label: "Sheet ID" }] },
];

export interface ConnectedSource {
  provider: string;
  status: string;
  live: boolean;
  lastImported: number;
}

export function LeadSourcesSection({ connected }: { connected: ConnectedSource[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState<LeadSourceKind | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [config, setConfig] = useState<Record<string, string>>({});

  const byProvider = new Map(connected.map((c) => [c.provider, c]));

  function run(fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) {
    startTransition(async () => {
      toastResult(await fn());
      router.refresh();
    });
  }

  return (
    <div className="mb-7">
      <p className="mb-3.5 text-[12px] font-semibold uppercase tracking-[1.6px] text-muted-2">Lead sources</p>
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        {SOURCES.map((s) => {
          const conn = byProvider.get(s.provider);
          const isConnected = conn?.status === "CONNECTED";
          const isOpen = open === s.provider;
          return (
            <div key={s.provider} className="rounded-xl2 border border-line bg-white p-4">
              <div className="flex items-center gap-3.5">
                <div className="flex h-10 w-10 flex-none items-center justify-center rounded-[10px] font-heading text-[13.5px] font-semibold text-white" style={{ background: s.color }}>
                  {s.mono}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="m-0 font-heading text-[15px] font-semibold text-ink">{s.name}</p>
                  <p className="m-0 truncate text-[12.5px] text-muted-2">{s.desc}</p>
                  <p className={`m-0 mt-0.5 text-[12px] font-semibold ${isConnected ? "text-sweep" : "text-muted-3"}`}>
                    {isConnected ? (conn?.live ? "✓ Connected (live)" : "✓ Connected (sample)") : "Not connected"}
                    {conn && conn.lastImported > 0 ? ` · ${conn.lastImported} imported` : ""}
                  </p>
                </div>
                {isConnected ? (
                  <div className="flex flex-none gap-2">
                    <button
                      disabled={pending}
                      onClick={() => run(() => importFromSourceAction({ provider: s.provider, priorContactAttested: true }))}
                      className="rounded-lg bg-sweep px-3 py-2 text-[12.5px] font-semibold text-white hover:opacity-90 disabled:opacity-60"
                    >
                      Import
                    </button>
                    <button disabled={pending} onClick={() => run(() => disconnectLeadSourceAction(s.provider))} className="rounded-lg border border-line-3 bg-white px-3 py-2 text-[12.5px] font-semibold text-muted hover:bg-cream">
                      ✕
                    </button>
                  </div>
                ) : (
                  <button onClick={() => { setOpen(isOpen ? null : s.provider); setApiKey(""); setConfig({}); }} className="flex-none rounded-lg bg-ember px-3.5 py-2 text-[12.5px] font-semibold text-white hover:bg-ember-hover">
                    {isOpen ? "Cancel" : "Connect"}
                  </button>
                )}
              </div>

              {isOpen && !isConnected && (
                <div className="mt-3 border-t border-line-2 pt-3">
                  <input
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={`${s.name} API key (leave blank for sample data)`}
                    className="mb-2 w-full rounded-lg border border-line-3 bg-white px-3 py-2 text-[13px] outline-none focus:border-sweep"
                  />
                  {s.fields.map((f) => (
                    <input
                      key={f.key}
                      value={config[f.key] ?? ""}
                      onChange={(e) => setConfig((c) => ({ ...c, [f.key]: e.target.value }))}
                      placeholder={f.label}
                      className="mb-2 w-full rounded-lg border border-line-3 bg-white px-3 py-2 text-[13px] outline-none focus:border-sweep"
                    />
                  ))}
                  <button
                    disabled={pending}
                    onClick={() => run(async () => { const r = await connectLeadSourceAction({ provider: s.provider, apiKey: apiKey || undefined, config }); if (r.ok) setOpen(null); return r; })}
                    className="rounded-lg bg-sweep px-4 py-2 text-[12.5px] font-semibold text-white hover:opacity-90 disabled:opacity-60"
                  >
                    {pending ? "Connecting…" : apiKey ? "Connect (live)" : "Connect (sample)"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-2.5 text-[12px] text-muted-3">
        Imports run through the same prior-contact gate + suppression filtering as CSV — reactivation only.
      </p>
    </div>
  );
}
