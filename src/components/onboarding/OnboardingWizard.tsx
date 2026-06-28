"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { connectSimulationMailboxAction } from "@/server/actions/mailbox";
import { connectSimulationCalendarAction, setBookingLinkAction } from "@/server/actions/calendar";

interface Props {
  brandName: string;
  brandColor: string;
  firstName: string;
  emailConnected: boolean;
  emailLabel: string | null;
  calendarConnected: boolean;
  bookingLink: string | null;
  googleConfigured: boolean;
  microsoftConfigured: boolean;
  notice: { kind: "connected" | "error"; text: string } | null;
}

const STEPS = ["Email", "Calendar", "Ready"] as const;

export function OnboardingWizard(props: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  // Start on the first thing that isn't done yet (also lands here after the
  // OAuth round-trip reloads with the new connection state).
  const [step, setStep] = useState(props.emailConnected ? (props.calendarConnected ? 2 : 1) : 0);
  const [link, setLink] = useState(props.bookingLink ?? "");
  const [msg, setMsg] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, onOk: () => void) {
    setMsg(null);
    start(async () => {
      const r = await fn();
      if (r.ok) onOk();
      else setMsg(r.error ?? "Couldn't connect — try again.");
    });
  }

  const doneCount = (props.emailConnected ? 1 : 0) + (props.calendarConnected ? 1 : 0);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[680px] flex-col px-6 py-10 sm:py-14">
      {/* header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <p className="m-0 font-heading text-[15px] font-semibold" style={{ color: props.brandColor }}>
            {props.brandName}
          </p>
          <p className="m-0 text-[12.5px] text-muted">Coach. Don&apos;t Chase.</p>
        </div>
        <button onClick={() => router.push("/")} className="text-[12.5px] font-semibold text-muted-3 hover:text-muted">
          Skip setup →
        </button>
      </div>

      {/* progress */}
      <div className="mb-9">
        <div className="mb-2.5 flex items-center gap-2">
          {STEPS.map((label, i) => (
            <div key={label} className="flex flex-1 items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line-2">
                <div className="h-full rounded-full bg-sweep transition-all duration-300" style={{ width: i <= step ? "100%" : "0%" }} />
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between text-[11.5px] font-semibold uppercase tracking-[0.6px]">
          {STEPS.map((label, i) => (
            <span key={label} className={i === step ? "text-sweep" : i < step ? "text-muted-2" : "text-muted-3"}>
              {label}
            </span>
          ))}
        </div>
      </div>

      {props.notice && (
        <div
          className={`mb-5 rounded-lg px-3.5 py-2.5 text-[13px] ${
            props.notice.kind === "connected" ? "bg-sweep-mist text-sweep" : "border border-[#f0d2c9] bg-[#fbf0ec] text-[#a14a2c]"
          }`}
        >
          {props.notice.text}
        </div>
      )}
      {msg && <div className="mb-5 rounded-lg border border-[#f0d2c9] bg-[#fbf0ec] px-3.5 py-2.5 text-[13px] text-[#a14a2c]">{msg}</div>}

      {/* ── Step 0: Email ───────────────────────────────────────────── */}
      {step === 0 && (
        <StepCard
          eyebrow="Step 1 of 2 · about 1 minute"
          title={props.firstName ? `Let's get you set up, ${props.firstName}` : "Let's get you set up"}
          blurb="First, connect the inbox your agent sends from — it writes and replies in your name, from your address."
        >
          {props.emailConnected ? (
            <Connected label={`Connected${props.emailLabel ? ` · ${props.emailLabel}` : ""}`} onContinue={() => setStep(1)} />
          ) : (
            <div className="flex flex-col gap-2.5">
              <OAuthOption
                enabled={props.googleConfigured}
                href="/api/connections/gmail/start?return=welcome"
                mono="G"
                monoBg="#ea4335"
                name="Gmail / Google Workspace"
                desc="Send & detect replies in your voice"
              />
              <OAuthOption
                enabled={props.microsoftConfigured}
                href="/api/connections/microsoft/start?return=welcome"
                mono="M"
                monoBg="#0078d4"
                name="Microsoft 365 / Outlook"
                desc="Outlook send & reply detection"
              />
              <button
                disabled={pending}
                onClick={() => run(connectSimulationMailboxAction, () => { setStep(1); router.refresh(); })}
                className="flex items-center gap-3.5 rounded-xl2 border border-sweep bg-sweep-mist px-4 py-3.5 text-left hover:opacity-90 disabled:opacity-60"
              >
                <Mono mono="◎" bg="#1B7A57" />
                <div className="min-w-0 flex-1">
                  <p className="m-0 font-heading text-[14.5px] font-semibold text-ink">{pending ? "Connecting…" : "Use a demo mailbox"}</p>
                  <p className="m-0 text-[12.5px] text-muted-2">See the whole loop instantly — connect your real inbox anytime.</p>
                </div>
                <span className="flex-none rounded-md bg-sweep px-2.5 py-1 text-[11.5px] font-semibold text-white">Instant</span>
              </button>
            </div>
          )}
          <SkipRow onSkip={() => setStep(1)} />
        </StepCard>
      )}

      {/* ── Step 1: Calendar ────────────────────────────────────────── */}
      {step === 1 && (
        <StepCard
          eyebrow="Step 2 of 2 · about 1 minute"
          title="Connect your calendar"
          blurb="So when a lead says yes, the agent can offer real times and book the call straight to your calendar."
        >
          {props.calendarConnected ? (
            <Connected label="Calendar connected" onContinue={() => setStep(2)} />
          ) : (
            <div className="flex flex-col gap-3.5">
              <button
                disabled={pending}
                onClick={() => run(connectSimulationCalendarAction, () => { setStep(2); router.refresh(); })}
                className="flex items-center gap-3.5 rounded-xl2 border border-sweep bg-sweep-mist px-4 py-3.5 text-left hover:opacity-90 disabled:opacity-60"
              >
                <Mono mono="C" bg="#1a1a1a" />
                <div className="min-w-0 flex-1">
                  <p className="m-0 font-heading text-[14.5px] font-semibold text-ink">{pending ? "Connecting…" : "Connect a calendar (demo)"}</p>
                  <p className="m-0 text-[12.5px] text-muted-2">Offers real slots & books the call. Swap in Cal.com / Calendly later.</p>
                </div>
                <span className="flex-none rounded-md bg-sweep px-2.5 py-1 text-[11.5px] font-semibold text-white">Instant</span>
              </button>

              <div className="rounded-xl2 border border-line bg-white p-4">
                <p className="m-0 mb-2 text-[12.5px] font-semibold text-ink">…or paste your booking link</p>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={link}
                    onChange={(e) => setLink(e.target.value)}
                    placeholder="https://cal.com/you/intro"
                    className="min-w-[220px] flex-1 rounded-lg border border-line-3 bg-white px-3 py-2 text-[13.5px] outline-none focus:border-sweep"
                  />
                  <button
                    disabled={pending || !link}
                    onClick={() => run(() => setBookingLinkAction({ bookingLink: link }), () => { setStep(2); router.refresh(); })}
                    className="rounded-lg bg-charcoal px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          )}
          <div className="mt-4 flex items-center justify-between">
            <button onClick={() => setStep(0)} className="text-[12.5px] font-semibold text-muted-3 hover:text-muted">← Back</button>
            <button onClick={() => setStep(2)} className="text-[12.5px] font-semibold text-muted hover:underline">Skip for now →</button>
          </div>
        </StepCard>
      )}

      {/* ── Step 2: Ready ───────────────────────────────────────────── */}
      {step === 2 && (
        <StepCard
          eyebrow={doneCount === 2 ? "You're all set" : "Almost ready"}
          title={doneCount === 2 ? "You're ready to sweep" : "You're almost ready"}
          blurb="One last thing — bring in the cold leads you want to revive. Everything else is wired up and waiting."
        >
          <ul className="mb-6 flex flex-col gap-2.5">
            <Recap done={props.emailConnected} label="Sending inbox connected" />
            <Recap done={props.calendarConnected} label="Calendar connected" />
            <Recap done={false} label="Import your leads (CSV)" pending />
          </ul>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => router.push("/leads/import")}
              className="rounded-lg bg-ember px-5 py-3 font-heading text-[14.5px] font-semibold text-white hover:bg-ember-hover"
            >
              Import your first leads →
            </button>
            <button
              onClick={() => router.push("/")}
              className="rounded-lg border border-line-3 bg-white px-5 py-3 text-[14.5px] font-semibold text-muted hover:bg-cream"
            >
              Explore the dashboard
            </button>
          </div>
          {doneCount < 2 && (
            <p className="m-0 mt-4 text-[12px] text-muted-3">
              You can finish connecting your {props.emailConnected ? "calendar" : "email"} anytime under Connections.
            </p>
          )}
        </StepCard>
      )}
    </div>
  );
}

function StepCard({ eyebrow, title, blurb, children }: { eyebrow: string; title: string; blurb: string; children: React.ReactNode }) {
  return (
    <div className="ws-rise rounded-xl2 border border-line bg-white p-7 shadow-card sm:p-8">
      <p className="m-0 mb-2 text-[11.5px] font-semibold uppercase tracking-[1.4px] text-sweep">{eyebrow}</p>
      <h1 className="m-0 mb-1.5 font-heading text-[24px] font-semibold tracking-[-0.4px] text-ink">{title}</h1>
      <p className="m-0 mb-6 text-[14px] leading-[1.55] text-muted">{blurb}</p>
      {children}
    </div>
  );
}

function Mono({ mono, bg }: { mono: string; bg: string }) {
  return (
    <div className="flex h-10 w-10 flex-none items-center justify-center rounded-[10px] font-heading text-[14px] font-semibold text-white" style={{ background: bg }}>
      {mono}
    </div>
  );
}

function OAuthOption({ enabled, href, mono, monoBg, name, desc }: { enabled: boolean; href: string; mono: string; monoBg: string; name: string; desc: string }) {
  const inner = (
    <>
      <Mono mono={mono} bg={monoBg} />
      <div className="min-w-0 flex-1">
        <p className="m-0 font-heading text-[14.5px] font-semibold text-ink">{name}</p>
        <p className="m-0 text-[12.5px] text-muted-2">{desc}</p>
      </div>
      {enabled ? (
        <span className="flex-none rounded-md border border-line-3 px-3 py-1 text-[12px] font-semibold text-muted">Connect</span>
      ) : (
        <span className="flex-none rounded-md border border-line-3 px-2.5 py-1 text-[11px] text-muted-3" title="Provider OAuth keys not configured yet">Needs setup</span>
      )}
    </>
  );
  const cls = "flex items-center gap-3.5 rounded-xl2 border border-line bg-white px-4 py-3.5 text-left transition-shadow";
  return enabled ? (
    <a href={href} className={`${cls} hover:border-[#d8d3c8] hover:shadow-card`}>{inner}</a>
  ) : (
    <div className={`${cls} opacity-70`}>{inner}</div>
  );
}

function Connected({ label, onContinue }: { label: string; onContinue: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl2 border border-[rgba(27,122,87,0.25)] bg-sweep-mist px-4 py-4">
      <span className="flex items-center gap-2 text-[14px] font-semibold text-sweep">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
        {label}
      </span>
      <button onClick={onContinue} className="rounded-lg bg-sweep px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90">Continue →</button>
    </div>
  );
}

function SkipRow({ onSkip }: { onSkip: () => void }) {
  return (
    <div className="mt-4 flex justify-end">
      <button onClick={onSkip} className="text-[12.5px] font-semibold text-muted hover:underline">Skip for now →</button>
    </div>
  );
}

function Recap({ done, label, pending }: { done: boolean; label: string; pending?: boolean }) {
  return (
    <li className="flex items-center gap-3">
      <span
        className={`flex h-6 w-6 flex-none items-center justify-center rounded-full ${
          done ? "bg-sweep text-white" : pending ? "border-2 border-dashed border-ember bg-white" : "bg-cream text-muted-3"
        }`}
      >
        {done ? (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
        ) : null}
      </span>
      <span className={`text-[14px] ${done ? "text-ink-soft line-through" : "text-ink"}`}>{label}</span>
    </li>
  );
}
