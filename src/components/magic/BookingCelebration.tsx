"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatMoney, timeAgo } from "@/lib/format";

/**
 * The payoff moment (M9). When a cold lead books a call, the coach should FEEL
 * it — money they'd written off, walking back through the door. Shows once per
 * booking (dismissed state remembered in localStorage so it doesn't nag), and
 * only for genuinely recent wins (the server already filters to < 48h).
 */
export function BookingCelebration({
  booking,
}: {
  booking: { id: string; name: string; valueCents: number; bookedAt: string; coldFor: string | null };
}) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      const seen = window.localStorage.getItem(`ws-celebrated-${booking.id}`);
      if (!seen) setShow(true);
    } catch {
      setShow(true);
    }
  }, [booking.id]);

  if (!show) return null;

  function dismiss() {
    try {
      window.localStorage.setItem(`ws-celebrated-${booking.id}`, "1");
    } catch {
      /* ignore */
    }
    setShow(false);
  }

  return (
    <div className="ws-rise mb-[22px] flex flex-wrap items-center gap-4 overflow-hidden rounded-xl2 border border-[rgba(27,122,87,0.3)] bg-gradient-to-r from-sweep to-[#15694a] px-6 py-5 text-white shadow-[0_8px_30px_-12px_rgba(27,122,87,0.6)]">
      <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-white/15 text-[22px]">🎉</span>
      <div className="min-w-0 flex-1">
        <p className="m-0 font-heading text-[17px] font-semibold leading-[1.35]">
          {booking.name} just booked a call{booking.valueCents > 0 && <> — {formatMoney(booking.valueCents)} reactivated</>}
        </p>
        <p className="m-0 mt-0.5 text-[13px] text-[#cdeede]">
          {booking.coldFor ? `From a lead that had gone quiet for ${booking.coldFor}. ` : ""}
          The agent revived it, handled the reply, and put it on your calendar · {timeAgo(new Date(booking.bookedAt))}
        </p>
      </div>
      <div className="flex flex-none items-center gap-2">
        <Link
          href="/conversations"
          className="rounded-lg bg-white/15 px-3.5 py-2 text-[12.5px] font-semibold text-white hover:bg-white/25"
        >
          See the thread →
        </Link>
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-white/80 hover:bg-white/15"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>
      </div>
    </div>
  );
}
