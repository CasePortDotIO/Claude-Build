"use client";

import { useEffect, useState } from "react";

/**
 * Lightweight, dependency-free toast system. `toast()` is callable from any
 * client component (no provider/prop-drilling) — it dispatches a window event
 * that the single <Toaster/> (mounted in the app layout) renders as a
 * consistent bottom-right stack. Replaces the ad-hoc per-page message banners.
 */
export type ToastKind = "success" | "error" | "info";

interface ToastItem {
  id: number;
  text: string;
  kind: ToastKind;
}

let counter = 0;

export function toast(text: string, kind: ToastKind = "success") {
  if (!text || typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("warmsweep:toast", { detail: { text, kind } }));
}

/** Convenience: toast from an action result `{ ok, message?, error? }`. */
export function toastResult(r: { ok: boolean; message?: string; error?: string }, fallback = "Done") {
  toast(r.ok ? r.message ?? fallback : r.error ?? "Something went wrong", r.ok ? "success" : "error");
}

function Icon({ kind }: { kind: ToastKind }) {
  if (kind === "error") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><path d="M12 8v5M12 16h.01" />
      </svg>
    );
  }
  if (kind === "info") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><path d="M12 11v5M12 8h.01" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    function onToast(e: Event) {
      const d = (e as CustomEvent).detail as { text?: string; kind?: ToastKind } | undefined;
      if (!d?.text) return;
      const id = ++counter;
      setItems((xs) => [...xs, { id, text: d.text!, kind: d.kind ?? "success" }]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 4200);
    }
    window.addEventListener("warmsweep:toast", onToast);
    return () => window.removeEventListener("warmsweep:toast", onToast);
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[120] flex flex-col gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          role="status"
          onClick={() => setItems((xs) => xs.filter((x) => x.id !== t.id))}
          className={`ws-rise pointer-events-auto flex max-w-[340px] cursor-pointer items-start gap-2.5 rounded-xl2 border px-4 py-3 text-[13.5px] font-medium shadow-[0_8px_30px_-10px_rgba(0,0,0,0.25)] ${
            t.kind === "error"
              ? "border-[#f0d2c9] bg-[#fbf0ec] text-[#a14a2c]"
              : t.kind === "info"
                ? "border-line bg-white text-ink"
                : "border-[rgba(27,122,87,0.3)] bg-white text-sweep"
          }`}
        >
          <span className="mt-px flex-none">
            <Icon kind={t.kind} />
          </span>
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}
