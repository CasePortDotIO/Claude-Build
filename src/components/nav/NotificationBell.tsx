"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  listNotificationsAction,
  unreadCountAction,
  markNotificationReadAction,
  markAllNotificationsReadAction,
  type NotificationsResult,
  type NotificationVM,
} from "@/server/actions/notifications";

const ICON: Record<string, string> = {
  REPLY_RECEIVED: "💬",
  CALL_BOOKED: "📅",
  DRAFT_READY: "✍️",
  SEND_FAILED: "⚠️",
  OPTED_OUT: "🚫",
  BOUNCED: "↩️",
};

function timeAgo(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function NotificationBell({ initial }: { initial: NotificationsResult }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(initial.unread);
  const [items, setItems] = useState<NotificationVM[]>(initial.items);
  const ref = useRef<HTMLDivElement>(null);

  // Poll the unread count so the badge stays live without a page refresh.
  useEffect(() => {
    const id = setInterval(() => {
      unreadCountAction().then(setUnread).catch(() => {});
    }, 20000);
    return () => clearInterval(id);
  }, []);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const refresh = useCallback(() => {
    listNotificationsAction()
      .then((r) => {
        setItems(r.items);
        setUnread(r.unread);
      })
      .catch(() => {});
  }, []);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) refresh();
  }

  function onItem(n: NotificationVM) {
    if (n.unread) {
      setItems((prev) => prev.map((p) => (p.id === n.id ? { ...p, unread: false } : p)));
      setUnread((u) => Math.max(0, u - 1));
      markNotificationReadAction(n.id).catch(() => {});
    }
    setOpen(false);
    if (n.actionUrl) router.push(n.actionUrl);
  }

  function markAll() {
    setItems((prev) => prev.map((p) => ({ ...p, unread: false })));
    setUnread(0);
    markAllNotificationsReadAction().catch(() => {});
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={toggle}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        aria-haspopup="true"
        aria-expanded={open}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-white text-muted hover:bg-cream"
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-ember px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="ws-rise absolute right-0 z-50 mt-2 w-[340px] overflow-hidden rounded-xl2 border border-line bg-white shadow-pop">
          <div className="flex items-center justify-between border-b border-line-2 px-4 py-3">
            <span className="font-heading text-[13.5px] font-semibold text-ink">Notifications</span>
            {unread > 0 && (
              <button onClick={markAll} className="text-[12px] font-semibold text-sweep hover:underline">
                Mark all read
              </button>
            )}
          </div>
          <div className="ws-scroll max-h-[60vh] overflow-y-auto sm:max-h-[400px]">
            {items.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="m-0 text-[13px] font-semibold text-ink">You're all caught up</p>
                <p className="m-0 mt-1 text-[12px] text-muted-2">Replies, bookings, and drafts will show up here.</p>
              </div>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => onItem(n)}
                  className={`flex w-full items-start gap-3 border-b border-line-2 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-cream ${n.unread ? "bg-[rgba(232,116,59,0.04)]" : ""}`}
                >
                  <span className="mt-0.5 flex-none text-[15px]" aria-hidden>{ICON[n.kind] ?? "•"}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[13px] font-semibold text-ink">{n.title}</span>
                      {n.unread && <span className="h-1.5 w-1.5 flex-none rounded-full bg-ember" aria-label="unread" />}
                    </span>
                    {n.body && <span className="mt-0.5 line-clamp-2 block text-[12px] leading-[1.45] text-muted-2">{n.body}</span>}
                    <span className="mt-0.5 block text-[11px] text-muted-3">{timeAgo(n.createdAt)}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
