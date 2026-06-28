"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { simulateReplyAction } from "@/server/actions/mailbox";
import { getAvailabilityAction, bookCallAction } from "@/server/actions/calendar";
import { toast, toastResult } from "@/components/ui/Toast";

export interface ThreadMessage {
  id: string;
  direction: "OUTBOUND" | "INBOUND";
  subject: string;
  body: string;
  when: string;
  isAutoReply: boolean;
  isBounce: boolean;
}
export interface ConversationVM {
  id: string;
  leadId: string;
  leadName: string;
  leadEmail: string;
  initials: string;
  status: string; // ConversationStatus
  leadStatus: string;
  reviewReason: string | null; // §5: why this thread needs careful attention
  booking: { whenLabel: string; meetingUrl: string | null } | null;
  lastSnippet: string;
  when: string;
  messages: ThreadMessage[];
}

const STATUS_TAG: Record<string, { label: string; cls: string }> = {
  AWAITING_REPLY: { label: "Awaiting reply", cls: "text-ember bg-[rgba(232,116,59,0.1)]" },
  NEEDS_REVIEW: { label: "Reply drafted · review", cls: "text-ember bg-[rgba(232,116,59,0.12)]" },
  ACTIVE: { label: "Active", cls: "text-sweep bg-[rgba(27,122,87,0.08)]" },
  BOOKED: { label: "Call booked", cls: "text-sweep bg-[rgba(27,122,87,0.1)]" },
  CLOSED: { label: "Closed", cls: "text-muted-2 bg-line-2" },
};

export function ConversationsClient({ conversations }: { conversations: ConversationVM[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [activeId, setActiveId] = useState<string | null>(conversations[0]?.id ?? null);

  if (conversations.length === 0) {
    return (
      <div className="rounded-xl2 border border-line bg-white p-12 text-center">
        <p className="m-0 mb-2 font-heading text-[18px] font-semibold text-ink">No conversations yet</p>
        <p className="m-0 text-[14px] text-muted">
          Approve a draft and send it — the thread shows up here, and the agent handles the replies.
        </p>
      </div>
    );
  }

  const active = conversations.find((c) => c.id === activeId) ?? conversations[0];

  function simulate(kind: "positive" | "optout" | "bounce") {
    startTransition(async () => {
      toastResult(await simulateReplyAction({ leadId: active.leadId, kind }), "Reply ingested");
      router.refresh();
    });
  }

  return (
    <div className="grid grid-cols-1 items-start gap-[18px] lg:grid-cols-[1fr_1.5fr]">
      {/* inbox */}
      <div className="overflow-hidden rounded-xl2 border border-line bg-white">
        <div className="border-b border-line-2 bg-cream-head px-5 py-4">
          <p className="m-0 font-heading text-[15px] font-semibold text-ink">
            Inbox <span className="font-medium text-muted-3">· AI-handled</span>
          </p>
        </div>
        {conversations.map((c) => {
          const on = c.id === active.id;
          const tag = STATUS_TAG[c.status] ?? STATUS_TAG.ACTIVE;
          return (
            <button
              key={c.id}
              onClick={() => setActiveId(c.id)}
              className={`flex w-full gap-3 border-b border-line-2 px-5 py-3.5 text-left last:border-b-0 ${on ? "bg-cream" : "hover:bg-cream-head"}`}
            >
              <div className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-full bg-avatar font-heading text-[15px] font-semibold text-white">
                {c.initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-0.5 flex items-center justify-between gap-2">
                  <p className="m-0 truncate text-[14px] font-semibold text-ink">{c.leadName}</p>
                  <span className="flex-none text-[11.5px] text-muted-3">{c.when}</span>
                </div>
                <p className="m-0 mb-1.5 truncate text-[13px] text-muted-2">{c.lastSnippet}</p>
                <span className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-semibold ${tag.cls}`}>{tag.label}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* thread */}
      <div className="flex flex-col overflow-hidden rounded-xl2 border border-line bg-white">
        <div className="flex items-center gap-3 border-b border-line-2 px-6 py-4">
          <div className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-full bg-avatar font-heading text-[15px] font-semibold text-white">
            {active.initials}
          </div>
          <div className="flex-1">
            <p className="m-0 font-heading text-[16px] font-semibold text-ink">{active.leadName}</p>
            <p className="m-0 text-[12.5px] text-muted-2">Handled by your agent · {active.leadEmail}</p>
          </div>
          <span className="flex items-center gap-1.5 rounded-full bg-[rgba(27,122,87,0.08)] px-3 py-1.5 text-[12.5px] font-semibold text-sweep">
            <span className="h-[7px] w-[7px] animate-wsPulse rounded-full bg-sweep" />
            Auto-pilot
          </span>
        </div>

        {/* messages */}
        <div className="flex min-h-[300px] flex-col gap-3.5 bg-[#FBFAF7] p-6">
          {active.messages.map((m) => {
            const out = m.direction === "OUTBOUND";
            return (
              <div key={m.id} className="flex w-full flex-col">
                <span className={`mb-1 text-[11px] font-semibold uppercase tracking-wide ${out ? "self-end text-sweep" : "text-muted-2"}`}>
                  {out ? "Agent → lead" : m.isBounce ? "Bounce" : m.isAutoReply ? "Auto-reply" : "Lead → you"}
                </span>
                <div
                  className={`max-w-[80%] whitespace-pre-line rounded-2xl px-4 py-3 text-[13.5px] leading-[1.55] ${
                    out ? "self-end bg-sweep text-white" : "self-start border border-line bg-white text-ink-soft"
                  }`}
                >
                  {m.body}
                </div>
              </div>
            );
          })}
        </div>

        {/* footer: booked confirmation, review banner, or demo controls */}
        {active.status === "BOOKED" ? (
          <Booked booking={active.booking} />
        ) : (
          <div className="flex flex-col gap-3 border-t border-line-2 bg-[#FBFAF7] px-6 py-4">
            {active.reviewReason && (
              <div className="flex items-start gap-2.5 rounded-lg border border-[#f0dcc9] bg-[#FBF3EC] px-3.5 py-2.5">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a16207" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 flex-none">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01" />
                </svg>
                <p className="m-0 text-[12.5px] leading-[1.45] text-[#7a5a44]">
                  <span className="font-semibold text-[#5a4030]">Flagged for you: </span>{active.reviewReason}. The agent drafted a safe holding reply rather than guess.
                </p>
              </div>
            )}
            {active.status === "NEEDS_REVIEW" && (
              <div className="flex items-center gap-3">
                <span className="h-2 w-2 flex-none animate-wsPulse rounded-full bg-ember" />
                <p className="m-0 flex-1 text-[13.5px] text-muted">The agent drafted a reply. Review it before it sends.</p>
                <Link href="/approvals" className="rounded-lg bg-ember px-4 py-2 text-[13px] font-semibold text-white hover:bg-ember-hover">
                  Review in approvals →
                </Link>
              </div>
            )}
            <BookControl leadId={active.leadId} pending={pending} startTransition={startTransition} onDone={(m) => { toast(m); router.refresh(); }} />
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12.5px] text-muted-2">Demo the reply loop:</span>
              <SimBtn disabled={pending} onClick={() => simulate("positive")}>Positive reply</SimBtn>
              <SimBtn disabled={pending} onClick={() => simulate("optout")}>Opt-out</SimBtn>
              <SimBtn disabled={pending} onClick={() => simulate("bounce")}>Bounce</SimBtn>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SimBtn({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled: boolean }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className="rounded-lg border border-line-3 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-muted hover:bg-cream disabled:opacity-60"
    >
      {children}
    </button>
  );
}

function BookControl({
  leadId,
  pending,
  startTransition,
  onDone,
}: {
  leadId: string;
  pending: boolean;
  startTransition: (cb: () => Promise<void> | void) => void;
  onDone: (msg: string) => void;
}) {
  const [slots, setSlots] = useState<{ startsAt: string; label: string }[] | null>(null);

  function loadSlots() {
    startTransition(async () => {
      const r = await getAvailabilityAction();
      if (r.ok && r.slots) setSlots(r.slots);
      else onDone(r.error ?? "No calendar connected");
    });
  }
  function book(startsAt: string) {
    startTransition(async () => {
      const r = await bookCallAction({ leadId, startsAt });
      onDone(r.ok ? r.message ?? "Booked" : r.error ?? "Error");
      setSlots(null);
    });
  }

  if (!slots) {
    return (
      <div className="flex items-center gap-2">
        <button
          disabled={pending}
          onClick={loadSlots}
          className="rounded-lg bg-sweep px-3.5 py-2 text-[12.5px] font-semibold text-white hover:opacity-90 disabled:opacity-60"
        >
          Book the call →
        </button>
        <span className="text-[12px] text-muted-3">offers real availability from the connected calendar</span>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[12.5px] font-semibold text-ink">Pick a slot:</span>
      {slots.map((s) => (
        <button
          key={s.startsAt}
          disabled={pending}
          onClick={() => book(s.startsAt)}
          className="rounded-lg border border-sweep px-3 py-1.5 text-[12.5px] font-semibold text-sweep hover:bg-sweep hover:text-white disabled:opacity-60"
        >
          {s.label}
        </button>
      ))}
      <button onClick={() => setSlots(null)} className="text-[12px] text-muted-3 hover:underline">cancel</button>
    </div>
  );
}

function Booked({ booking }: { booking: { whenLabel: string; meetingUrl: string | null } | null }) {
  return (
    <div className="flex items-center gap-3 border-t border-[rgba(27,122,87,0.2)] bg-[#F6FBF8] px-6 py-4">
      <div className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[9px] bg-sweep">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      </div>
      <div className="flex-1">
        <p className="m-0 text-[14px] font-semibold text-ink">Call booked to your calendar</p>
        <p className="m-0 text-[13px] text-sweep">
          {booking?.whenLabel ?? "Confirmed"}
          {booking?.meetingUrl ? (
            <>
              {" · "}
              <a href={booking.meetingUrl} className="underline" target="_blank" rel="noreferrer">join link</a>
            </>
          ) : null}
        </p>
      </div>
      <span className="text-[12.5px] text-muted-2">You did nothing.</span>
    </div>
  );
}
