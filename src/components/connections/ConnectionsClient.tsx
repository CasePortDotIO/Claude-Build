"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { connectSimulationMailboxAction, disconnectMailboxAction } from "@/server/actions/mailbox";

export interface MailboxVM {
  id: string;
  email: string;
  provider: string;
  status: string;
  sentToday: number;
  dailyCap: number;
}

export function ConnectionsClient({ mailboxes, googleConfigured }: { mailboxes: MailboxVM[]; googleConfigured: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const connected = mailboxes.filter((m) => m.status === "CONNECTED");

  return (
    <div className="max-w-[1000px]">
      <div className="mb-6 flex flex-wrap items-center gap-4 rounded-xl2 border border-[rgba(27,122,87,0.2)] bg-sweep-mist px-5 py-4">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1B7A57" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 0 1 0 10h-2M8 12h8" />
        </svg>
        <p className="m-0 min-w-[220px] flex-1 text-[14px] leading-[1.55] text-ink-soft">
          Connect the mailbox the agent sends from. Tokens are <strong className="font-semibold text-sweep">encrypted at rest</strong>; your
          key never touches the browser.
        </p>
        <span className="rounded-full bg-[rgba(27,122,87,0.08)] px-3 py-1.5 text-[12.5px] font-semibold text-sweep">
          {connected.length} connected
        </span>
      </div>

      {msg && <div className="mb-4 rounded-lg bg-sweep-mist px-3 py-2 text-[13px] text-sweep">{msg}</div>}

      <p className="mb-3.5 text-[12px] font-semibold uppercase tracking-[1.6px] text-muted-2">Sending mailbox</p>
      <div className="mb-7 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        {/* Gmail card */}
        <Card
          mono="G"
          monoBg="#ea4335"
          name="Gmail / Workspace"
          desc="Send & detect replies in your voice"
          status={statusFor(mailboxes, "GMAIL")}
        >
          {googleConfigured ? (
            <a href="/api/connections/gmail/start" className="rounded-lg bg-ember px-4 py-2 text-[13px] font-semibold text-white hover:bg-ember-hover">
              Connect
            </a>
          ) : (
            <span className="rounded-lg border border-line-3 px-3 py-2 text-[12px] text-muted-3" title="Set GOOGLE_CLIENT_ID/SECRET to enable">
              Needs OAuth keys
            </span>
          )}
        </Card>

        {/* Microsoft (stub, M7) */}
        <Card mono="M" monoBg="#0078d4" name="Microsoft 365" desc="Outlook send & reply detection" status="Lands in M7">
          <span className="rounded-lg border border-line-3 px-3 py-2 text-[12px] text-muted-3">Soon</span>
        </Card>
      </div>

      <p className="mb-3.5 text-[12px] font-semibold uppercase tracking-[1.6px] text-muted-2">Demo / offline</p>
      <div className="mb-7 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <Card mono="◎" monoBg="#1B7A57" name="Simulated mailbox" desc="Run the full send + reply loop with no Google account" status={statusFor(mailboxes, "SIMULATION")}>
          {statusFor(mailboxes, "SIMULATION") === "Connected" ? (
            <button
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const sim = mailboxes.find((m) => m.provider === "SIMULATION");
                  if (sim) { const r = await disconnectMailboxAction(sim.id); setMsg(r.message ?? ""); router.refresh(); }
                })
              }
              className="rounded-lg border border-line-3 bg-white px-4 py-2 text-[13px] font-semibold text-muted hover:bg-cream"
            >
              Disconnect
            </button>
          ) : (
            <button
              disabled={pending}
              onClick={() => startTransition(async () => { const r = await connectSimulationMailboxAction(); setMsg(r.message ?? ""); router.refresh(); })}
              className="rounded-lg bg-sweep px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90"
            >
              {pending ? "Connecting…" : "Connect"}
            </button>
          )}
        </Card>
      </div>

      {connected.length > 0 && (
        <div className="rounded-xl2 border border-line bg-white p-5">
          <p className="m-0 mb-3 text-[12px] font-semibold uppercase tracking-[1.6px] text-muted-2">Daily send caps</p>
          {connected.map((m) => (
            <div key={m.id} className="flex items-center justify-between border-b border-line-2 py-2 last:border-b-0">
              <span className="text-[13.5px] text-ink">{m.email}</span>
              <span className="font-mono text-[12px] text-muted">{m.sentToday}/{m.dailyCap} today</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function statusFor(mailboxes: MailboxVM[], provider: string): string {
  const m = mailboxes.find((x) => x.provider === provider);
  if (!m) return "Not connected";
  return m.status === "CONNECTED" ? "Connected" : m.status === "PAUSED" ? "Paused" : "Disconnected";
}

function Card({
  mono,
  monoBg,
  name,
  desc,
  status,
  children,
}: {
  mono: string;
  monoBg: string;
  name: string;
  desc: string;
  status: string;
  children: React.ReactNode;
}) {
  const on = status === "Connected";
  return (
    <div className="flex items-center gap-3.5 rounded-xl2 border border-line bg-white px-4 py-4">
      <div className="flex h-10 w-10 flex-none items-center justify-center rounded-[10px] font-heading text-[14px] font-semibold text-white" style={{ background: monoBg }}>
        {mono}
      </div>
      <div className="min-w-0 flex-1">
        <p className="m-0 font-heading text-[15px] font-semibold text-ink">{name}</p>
        <p className="m-0 truncate text-[12.5px] text-muted-2">{desc}</p>
        <p className={`m-0 mt-0.5 text-[12px] font-semibold ${on ? "text-sweep" : "text-muted-3"}`}>
          {on ? "✓ " : ""}
          {status}
        </p>
      </div>
      {children}
    </div>
  );
}
