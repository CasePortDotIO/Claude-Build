"use client";

import { useEffect, useRef } from "react";

/**
 * A small, accessible confirmation modal — the in-app replacement for the native
 * confirm() dialog (which looks unbranded and can't be styled). Escape or a
 * backdrop click cancels; the confirm button auto-focuses. `danger` tints the
 * confirm action for destructive operations.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => confirmRef.current?.focus(), 0);
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => { clearTimeout(t); window.removeEventListener("keydown", onKey); };
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="ws-rise w-full max-w-[400px] rounded-xl2 border border-line bg-white p-6 shadow-lift"
      >
        <p className="m-0 mb-1.5 font-heading text-[17px] font-semibold text-ink">{title}</p>
        <p className="m-0 mb-5 text-[13.5px] leading-[1.55] text-muted">{body}</p>
        <div className="flex justify-end gap-2.5">
          <button
            onClick={onCancel}
            className="rounded-lg border border-line-3 bg-white px-4 py-2.5 text-[13.5px] font-semibold text-muted hover:bg-cream"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            className={`rounded-lg px-4 py-2.5 text-[13.5px] font-semibold text-white hover:opacity-90 ${danger ? "bg-[#b43c3c]" : "bg-sweep"}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
