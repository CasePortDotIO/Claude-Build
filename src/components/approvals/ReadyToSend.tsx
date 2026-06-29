"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendDraftAction, sendAllApprovedAction } from "@/server/actions/mailbox";
import { toastResult } from "@/components/ui/Toast";
import { SpinnerLabel } from "@/components/ui/Spinner";

export interface ReadyItem {
  draftId: string;
  leadName: string;
  subject: string;
}

export function ReadyToSend({ items, hasMailbox }: { items: ReadyItem[]; hasMailbox: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (items.length === 0) return null;

  function run(fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) {
    startTransition(async () => {
      toastResult(await fn(), "Sent");
      router.refresh();
    });
  }

  return (
    <div className="mb-5 rounded-xl2 border border-[rgba(27,122,87,0.25)] bg-sweep-mist p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="m-0 font-heading text-[15px] font-semibold text-ink">
            {items.length} approved &amp; ready to send
          </p>
          <p className="m-0 text-[12.5px] text-muted">
            {hasMailbox
              ? "Approved is not sent — this is the irreversible step. Send when you're ready."
              : "Connect a mailbox under Connections first."}
          </p>
        </div>
        <button
          disabled={pending || !hasMailbox}
          onClick={() => run(() => sendAllApprovedAction())}
          className="rounded-lg bg-sweep px-4 py-2.5 font-heading text-[13.5px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {pending ? <SpinnerLabel>Sending…</SpinnerLabel> : "Send all"}
        </button>
      </div>
      <div className="flex flex-col gap-2">
        {items.map((it) => (
          <div key={it.draftId} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-white px-3.5 py-2.5">
            <div className="min-w-0">
              <span className="text-[13.5px] font-semibold text-ink">{it.leadName}</span>
              <span className="ml-2 truncate text-[12.5px] text-muted-2">{it.subject}</span>
            </div>
            <button
              disabled={pending || !hasMailbox}
              onClick={() => run(() => sendDraftAction(it.draftId))}
              className="flex-none rounded-lg border border-sweep px-3 py-1.5 text-[12.5px] font-semibold text-sweep hover:bg-sweep hover:text-white disabled:opacity-50"
            >
              Send
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
