"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { suppressEmailAction, resumeMailboxAction, setMailingAddressAction } from "@/server/actions/compliance";
import { rescrubAndResumeAction } from "@/server/actions/mailbox";

export interface MailboxHealthVM {
  id: string;
  email: string;
  status: string;
  pausedReason: string | null;
  sentToday: number;
  effectiveDailyCap: number;
  dailyCap: number;
  hourlyCap: number;
  warmupDay: number;
  warming: boolean;
  bounceRatePct: number;
  alert: "ok" | "alert";
  alertReason: string | null;
  requiresRescrub: boolean;
}

export interface SuppressionVM {
  email: string;
  reason: string;
  when: string;
}

export function DeliverabilityClient({
  mailboxes,
  suppressions,
  suppressionCount,
  hasMailingAddress,
}: {
  mailboxes: MailboxHealthVM[];
  suppressions: SuppressionVM[];
  suppressionCount: number;
  hasMailingAddress: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [addr, setAddr] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) {
    startTransition(async () => {
      const r = await fn();
      setMsg(r.ok ? r.message ?? "Done" : r.error ?? "Error");
      router.refresh();
      setTimeout(() => setMsg(null), 4000);
    });
  }

  return (
    <div className="space-y-4">
      {msg && <div className="rounded-lg bg-sweep-mist px-3 py-2 text-[13px] text-sweep">{msg}</div>}

      {!hasMailingAddress && (
        <div className="rounded-xl2 border border-[#f0dcc9] bg-[#FBF3EC] p-4">
          <p className="m-0 mb-2 text-[13.5px] font-semibold text-[#7a5a44]">
            CAN-SPAM: add your physical mailing address before sending.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={addr}
              onChange={(e) => setAddr(e.target.value)}
              placeholder="123 Main St, Austin, TX 78701"
              className="min-w-[280px] flex-1 rounded-lg border border-[#e6d3bf] bg-white px-3 py-2 text-[13.5px] outline-none focus:border-ember"
            />
            <button disabled={pending || !addr} onClick={() => run(() => setMailingAddressAction(addr))} className="rounded-lg bg-ember px-4 py-2 text-[13px] font-semibold text-white hover:bg-ember-hover disabled:opacity-50">
              Save address
            </button>
          </div>
        </div>
      )}

      {/* mailbox caps + warmup */}
      <div className="rounded-xl2 border border-line bg-white p-5">
        <p className="m-0 mb-3 text-[12px] font-semibold uppercase tracking-[1.6px] text-muted-2">Sending mailboxes</p>
        {mailboxes.length === 0 ? (
          <p className="m-0 text-[13.5px] text-muted">No mailbox connected yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {mailboxes.map((m) => (
              <div key={m.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-line-2 px-4 py-3">
                <div className="min-w-[180px] flex-1">
                  <p className="m-0 text-[14px] font-semibold text-ink">{m.email}</p>
                  <p className="m-0 text-[12px] text-muted-2">
                    {m.sentToday}/{m.effectiveDailyCap} today · {m.hourlyCap}/hr
                    {m.warming && <span className="text-ember"> · warming up (day {m.warmupDay})</span>}
                    {m.bounceRatePct > 0 && <span> · {m.bounceRatePct}% bounce</span>}
                  </p>
                </div>
                {m.status === "PAUSED" ? (
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-[rgba(180,60,60,0.1)] px-2 py-1 text-[11.5px] font-semibold text-[#b43c3c]" title={m.pausedReason ?? ""}>
                      Auto-paused
                    </span>
                    {m.requiresRescrub ? (
                      <button disabled={pending} onClick={() => run(() => rescrubAndResumeAction(m.id))} title="Re-verifies your list, then resumes" className="rounded-lg bg-ember px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-ember-hover disabled:opacity-50">
                        Re-scrub &amp; resume
                      </button>
                    ) : (
                      <button disabled={pending} onClick={() => run(() => resumeMailboxAction(m.id))} className="rounded-lg border border-line-3 bg-white px-3 py-1.5 text-[12px] font-semibold text-muted hover:bg-cream">
                        Resume
                      </button>
                    )}
                  </div>
                ) : m.alert === "alert" ? (
                  <span className="rounded-md bg-[#fdf0e8] px-2 py-1 text-[11.5px] font-semibold text-ember" title={m.alertReason ?? ""}>
                    Watch — {m.alertReason}
                  </span>
                ) : (
                  <span className="rounded-md bg-[rgba(27,122,87,0.08)] px-2 py-1 text-[11.5px] font-semibold text-sweep">Healthy</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* suppression list */}
      <div className="rounded-xl2 border border-line bg-white p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <p className="m-0 text-[12px] font-semibold uppercase tracking-[1.6px] text-muted-2">
            Suppression list · {suppressionCount}
          </p>
          <div className="flex items-center gap-2">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="suppress an email…"
              className="w-[220px] rounded-lg border border-line-3 bg-white px-3 py-1.5 text-[13px] outline-none focus:border-sweep"
            />
            <button disabled={pending || !email} onClick={() => run(async () => { const r = await suppressEmailAction(email); if (r.ok) setEmail(""); return r; })} className="rounded-lg bg-charcoal px-3 py-1.5 text-[12.5px] font-semibold text-white hover:opacity-90 disabled:opacity-50">
              Suppress
            </button>
          </div>
        </div>
        {suppressions.length === 0 ? (
          <p className="m-0 text-[13.5px] text-muted">No suppressed contacts. Opt-outs and bounces land here automatically.</p>
        ) : (
          <div className="flex flex-col">
            {suppressions.map((s) => (
              <div key={s.email} className="flex items-center justify-between border-b border-line-2 py-2 last:border-b-0">
                <span className="text-[13.5px] text-ink">{s.email}</span>
                <span className="flex items-center gap-3 text-[12px] text-muted-2">
                  <span className="rounded bg-line-2 px-2 py-0.5 font-semibold">{s.reason.replace(/_/g, " ").toLowerCase()}</span>
                  {s.when}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
