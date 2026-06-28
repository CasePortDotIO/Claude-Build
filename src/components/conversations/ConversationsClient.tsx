"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { simulateReplyAction } from "@/server/actions/mailbox";
import { getAvailabilityAction, bookCallAction } from "@/server/actions/calendar";
import { toast, toastResult } from "@/components/ui/Toast";
import { Kbd } from "@/components/ui/Kbd";

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

/**
 * Keyboard-first conversations. Master-detail inbox built for speed: j/k (or
 * arrows) to move between threads, b to open the booking flow, the thread panel
 * re-pops on selection so switching feels instant. Mirrors the Approvals triage
 * model so the muscle memory carries across the app.
 */
export function ConversationsClient({ conversations }: { conversations: ConversationVM[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [activeId, setActiveId] = useState<string | null>(conversations[0]?.id ?? null);
  const [bookingOpen, setBookingOpen] = useState(false);

  const active = conversations.find((c) => c.id === activeId) ?? conversations[0] ?? null;

  // Reset the booking flow whenever we move to a different thread.
  useEffect(() => {
    setBookingOpen(false);
  }, [activeId]);

  function simulate(kind: "positive" | "optout" | "bounce") {
    if (!active) return;
    const leadId = active.leadId;
    startTransition(async () => {
      toastResult(await simulateReplyAction({ leadId, kind }), "Reply ingested");
      router.refresh();
    });
  }

  // Single global key handler reading latest state via a ref — j/k navigation
  // plus b to jump straight into booking a call.
  const h = useRef({ conversations, active });
  h.current = { conversations, active };
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA");
      if (typing) {
        if (e.key === "Escape") (t as HTMLElement).blur();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const s = h.current;
      if (!s.active) return;
      const idx = s.conversations.findIndex((c) => c.id === s.active!.id);
      switch (e.key) {
        case "j": case "ArrowDown": { e.preventDefault(); const n = s.conversations[Math.min(idx + 1, s.conversations.length - 1)]; if (n) setActiveId(n.id); break; }
        case "k": case "ArrowUp": { e.preventDefault(); const n = s.conversations[Math.max(idx - 1, 0)]; if (n) setActiveId(n.id); break; }
        case "b": if (s.active.status !== "BOOKED") { e.preventDefault(); setBookingOpen(true); } break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (conversations.length === 0 || !active) {
    return (
      <div className="ws-rise rounded-xl2 border border-line bg-white p-12 text-center shadow-card">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-sweep-mist text-sweep">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
        </div>
        <p className="m-0 mb-1.5 font-heading text-[18px] font-semibold text-ink">No conversations yet</p>
        <p className="m-0 text-[14px] text-muted">
          Approve a draft and send it — the thread shows up here, and the agent handles the replies.
        </p>
      </div>
    );
  }

  const activeIdx = conversations.findIndex((c) => c.id === active.id);

  return (
    <div className="grid grid-cols-1 items-start gap-[18px] lg:grid-cols-[1fr_1.5fr]">
      {/* inbox */}
      <div className="overflow-hidden rounded-xl2 border border-line bg-white shadow-card">
        <div className="flex items-center justify-between border-b border-line-2 bg-cream-head px-5 py-4">
          <p className="m-0 font-heading text-[15px] font-semibold text-ink">
            Inbox <span className="font-medium text-muted-3">· AI-handled</span>
          </p>
          <span className="text-[11px] font-semibold uppercase tracking-[0.8px] text-muted-3">{conversations.length}</span>
        </div>
        <div className="max-h-[64vh] overflow-y-auto">
          {conversations.map((c) => {
            const on = c.id === active.id;
            const tag = STATUS_TAG[c.status] ?? STATUS_TAG.ACTIVE;
            return (
              <button
                key={c.id}
                onClick={() => setActiveId(c.id)}
                className={`relative flex w-full gap-3 border-b border-line-2 px-5 py-3.5 pl-6 text-left last:border-b-0 transition-colors ${on ? "bg-cream" : "hover:bg-cream-head"}`}
              >
                {on && <span className="absolute left-0 top-0 h-full w-[3px] bg-sweep" />}
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
      </div>

      {/* thread — re-pops on selection change for a responsive feel */}
      <div key={active.id} className="flex animate-wsPop flex-col overflow-hidden rounded-xl2 border border-line bg-white shadow-card">
        <div className="flex items-center gap-3 border-b border-line-2 px-6 py-4">
          <div className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-full bg-avatar font-heading text-[15px] font-semibold text-white">
            {active.initials}
          </div>
          <div className="flex-1">
            <p className="m-0 font-heading text-[16px] font-semibold text-ink">{active.leadName}</p>
            <p className="m-0 text-[12.5px] text-muted-2">Handled by your agent · {active.leadEmail}</p>
          </div>
          <span className="hidden flex-none font-mono text-[11px] text-muted-3 sm:inline">{activeIdx + 1} of {conversations.length}</span>
          <span className="flex items-center gap-1.5 rounded-full bg-[rgba(27,122,87,0.08)] px-3 py-1.5 text-[12.5px] font-semibold text-sweep">
            <span className="h-[7px] w-[7px] animate-wsPulse rounded-full bg-sweep" />
            Auto-pilot
          </span>
        </div>

        {/* messages */}
        <div className="ws-scroll flex max-h-[52vh] min-h-[300px] flex-col gap-3.5 overflow-y-auto bg-[#FBFAF7] p-6">
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
            <BookControl
              leadId={active.leadId}
              pending={pending}
              open={bookingOpen}
              setOpen={setBookingOpen}
              startTransition={startTransition}
              onDone={(m) => { toast(m); router.refresh(); }}
            />
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12.5px] text-muted-2">Demo the reply loop:</span>
              <SimBtn disabled={pending} onClick={() => simulate("positive")}>Positive reply</SimBtn>
              <SimBtn disabled={pending} onClick={() => simulate("optout")}>Opt-out</SimBtn>
              <SimBtn disabled={pending} onClick={() => simulate("bounce")}>Bounce</SimBtn>
            </div>
          </div>
        )}
      </div>

      {/* keyboard hint bar — full-width under the grid */}
      <div className="col-span-full hidden flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-[11.5px] text-muted-3 sm:flex">
        <span className="flex items-center gap-1"><Kbd>J</Kbd><Kbd>K</Kbd> move between threads</span>
        {active.status !== "BOOKED" && <span className="flex items-center gap-1"><Kbd>B</Kbd> book the call</span>}
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
  open,
  setOpen,
  startTransition,
  onDone,
}: {
  leadId: string;
  pending: boolean;
  open: boolean;
  setOpen: (v: boolean) => void;
  startTransition: (cb: () => Promise<void> | void) => void;
  onDone: (msg: string) => void;
}) {
  const [slots, setSlots] = useState<{ startsAt: string; label: string }[] | null>(null);

  // The `b` shortcut flips `open` — auto-load availability when it does.
  useEffect(() => {
    if (open && !slots) {
      startTransition(async () => {
        const r = await getAvailabilityAction();
        if (r.ok && r.slots) setSlots(r.slots);
        else { onDone(r.error ?? "No calendar connected"); setOpen(false); }
      });
    }
    if (!open) setSlots(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function book(startsAt: string) {
    startTransition(async () => {
      const r = await bookCallAction({ leadId, startsAt });
      onDone(r.ok ? r.message ?? "Booked" : r.error ?? "Error");
      setSlots(null);
      setOpen(false);
    });
  }

  if (!open || !slots) {
    return (
      <div className="flex items-center gap-2">
        <button
          disabled={pending}
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 rounded-lg bg-sweep px-3.5 py-2 text-[12.5px] font-semibold text-white hover:opacity-90 disabled:opacity-60"
        >
          Book the call → <Kbd dark>B</Kbd>
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
      <button onClick={() => { setSlots(null); setOpen(false); }} className="text-[12px] text-muted-3 hover:underline">cancel</button>
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
