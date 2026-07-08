"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { connectSimulationMailboxAction, disconnectMailboxAction } from "@/server/actions/mailbox";
import {
  connectSimulationCalendarAction,
  setBookingLinkAction,
  setSlackWebhookAction,
} from "@/server/actions/calendar";
import { toastResult } from "@/components/ui/Toast";
import { SpinnerLabel } from "@/components/ui/Spinner";

export interface MailboxVM {
  id: string;
  email: string;
  provider: string;
  status: string;
  sentToday: number;
  dailyCap: number;
}

export interface CalendarVM {
  provider: string;
  status: string;
  bookingLink: string | null;
}

export function ConnectionsClient({
  mailboxes,
  googleConfigured,
  microsoftConfigured,
  calendar,
  slackConfigured,
  calcomWebhookUrl,
  exploreMode,
}: {
  mailboxes: MailboxVM[];
  googleConfigured: boolean;
  microsoftConfigured: boolean;
  calendar: CalendarVM | null;
  slackConfigured: boolean;
  calcomWebhookUrl: string;
  exploreMode: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [link, setLink] = useState(calendar?.bookingLink ?? "");
  const [slack, setSlack] = useState("");

  const connected = mailboxes.filter((m) => m.status === "CONNECTED");
  const calConnected = calendar?.status === "CONNECTED";

  function run(fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) {
    startTransition(async () => {
      toastResult(await fn());
      router.refresh();
    });
  }

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
            <span className="rounded-lg border border-line-3 px-3 py-2 text-[12px] text-muted-3" title="Gmail connection isn't enabled for this workspace yet — reach out to support to turn it on.">
              Not available yet
            </span>
          )}
        </Card>

        {/* Microsoft 365 (M7) */}
        <Card mono="M" monoBg="#0078d4" name="Microsoft 365" desc="Outlook send & reply detection" status={statusFor(mailboxes, "MICROSOFT")}>
          {microsoftConfigured ? (
            <a href="/api/connections/microsoft/start" className="rounded-lg bg-ember px-4 py-2 text-[13px] font-semibold text-white hover:bg-ember-hover">
              Connect
            </a>
          ) : (
            <span className="rounded-lg border border-line-3 px-3 py-2 text-[12px] text-muted-3" title="Outlook connection isn't enabled for this workspace yet — reach out to support to turn it on.">
              Not available yet
            </span>
          )}
        </Card>
      </div>

      {exploreMode && (
        <>
          <p className="mb-3.5 text-[12px] font-semibold uppercase tracking-[1.6px] text-muted-2">Test inbox</p>
          <div className="mb-7 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <Card mono="◎" monoBg="#1B7A57" name="Test inbox" desc="Run the full send + reply loop without a real inbox (test mode — no real email is sent)" status={statusFor(mailboxes, "SIMULATION")}>
              {statusFor(mailboxes, "SIMULATION") === "Connected" ? (
                <button
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const sim = mailboxes.find((m) => m.provider === "SIMULATION");
                      if (sim) { toastResult(await disconnectMailboxAction(sim.id)); router.refresh(); }
                    })
                  }
                  className="rounded-lg border border-line-3 bg-white px-4 py-2 text-[13px] font-semibold text-muted hover:bg-cream"
                >
                  Disconnect
                </button>
              ) : (
                <button
                  disabled={pending}
                  onClick={() => startTransition(async () => { toastResult(await connectSimulationMailboxAction()); router.refresh(); })}
                  className="rounded-lg bg-sweep px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90"
                >
                  {pending ? <SpinnerLabel>Connecting…</SpinnerLabel> : "Connect"}
                </button>
              )}
            </Card>
          </div>
        </>
      )}

      <p className="mb-3.5 text-[12px] font-semibold uppercase tracking-[1.6px] text-muted-2">Calendar &amp; booking</p>
      <div className="mb-3.5 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <Card mono="C" monoBg="#1a1a1a" name="Cal.com" desc="Offer real slots & book the call" status={calConnected && calendar?.provider === "CALCOM" ? "Connected" : "Add your booking link below"}>
          {exploreMode ? (
            <button
              disabled={pending}
              onClick={() => run(() => connectSimulationCalendarAction())}
              className="rounded-lg bg-sweep px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90"
              title="Connect a test calendar to try booking time slots (test mode)"
            >
              {calConnected ? "Reconnect test" : "Use a test calendar"}
            </button>
          ) : (
            <span className="rounded-lg border border-line-3 px-3 py-2 text-[12px] text-muted-3">Link-based</span>
          )}
        </Card>
        <Card mono="◷" monoBg="#0a1f3c" name="Calendly" desc="Offer slots; invitee self-books (webhook)" status={calConnected && calendar?.provider === "CALENDLY" ? "Connected" : "Use the booking link below"}>
          <span className="rounded-lg border border-line-3 px-3 py-2 text-[12px] text-muted-3">Link-based</span>
        </Card>
      </div>
      <div className="mb-7 rounded-xl2 border border-line bg-white p-4 shadow-card">
        <p className="m-0 mb-2 text-[12.5px] font-semibold text-ink">Booking link fallback</p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://cal.com/you/intro"
            className="min-w-[260px] flex-1 rounded-lg border border-line-3 bg-white px-3 py-2 text-[13.5px] outline-none focus:border-sweep"
          />
          <button disabled={pending || !link} onClick={() => run(() => setBookingLinkAction({ bookingLink: link }))} className="rounded-lg border border-line-3 bg-white px-4 py-2 text-[13px] font-semibold text-muted hover:bg-cream disabled:opacity-50">
            Save link
          </button>
        </div>
        <p className="m-0 mb-1 mt-3 text-[12px] font-semibold text-ink">Cal.com webhook URL (paste into Cal.com → Webhooks)</p>
        <code className="block truncate rounded-lg border border-line-2 bg-cream px-3 py-2 font-mono text-[11.5px] text-muted-2" title={calcomWebhookUrl}>
          {calcomWebhookUrl}
        </code>
        <p className="m-0 mt-1 text-[11px] text-muted-3">Carries a per-workspace signed token — bookings are scoped to your org only.</p>
      </div>

      <p className="mb-3.5 text-[12px] font-semibold uppercase tracking-[1.6px] text-muted-2">Notifications</p>
      <div className="mb-7 rounded-xl2 border border-line bg-white p-4 shadow-card">
        <p className="m-0 mb-2 text-[12.5px] font-semibold text-ink">
          Slack — ping you the moment a call books {slackConfigured && <span className="text-sweep">· connected</span>}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={slack}
            onChange={(e) => setSlack(e.target.value)}
            placeholder="https://hooks.slack.com/services/…"
            className="min-w-[260px] flex-1 rounded-lg border border-line-3 bg-white px-3 py-2 text-[13.5px] outline-none focus:border-sweep"
          />
          <button disabled={pending || !slack} onClick={() => run(() => setSlackWebhookAction({ webhook: slack }))} className="rounded-lg border border-line-3 bg-white px-4 py-2 text-[13px] font-semibold text-muted hover:bg-cream disabled:opacity-50">
            Save webhook
          </button>
        </div>
      </div>

      {connected.length > 0 && (
        <div className="rounded-xl2 border border-line bg-white p-5 shadow-card">
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
    <div className="flex items-center gap-3.5 rounded-xl2 border border-line bg-white px-4 py-4 shadow-card transition-shadow hover:shadow-pop">
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
