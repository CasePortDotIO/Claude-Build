"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setAutopilotAction } from "@/server/actions/autopilot";
import { toast } from "@/components/ui/Toast";

export interface AutopilotState {
  sync: boolean;
  draft: boolean;
  send: boolean;
  approve: boolean;
}

const ROWS: { key: keyof AutopilotState; name: string; desc: string; strong?: boolean }[] = [
  {
    key: "sync",
    name: "Sync fresh leads",
    desc: "Pull connected lead sources every few hours and ingest new leads automatically — same prior-contact + suppression gate as a manual import.",
  },
  {
    key: "draft",
    name: "Auto-draft new leads",
    desc: "Generate re-engagement drafts for fresh leads as they arrive — queued for your approval, never sent unreviewed.",
  },
  {
    key: "send",
    name: "Auto-send approved",
    desc: "Send drafts you've already approved on a schedule, so first touch goes out in hours. Every send rail (caps, warmup, domain auth) still applies.",
  },
  {
    key: "approve",
    name: "Auto-send without approval",
    desc: "Skip the queue: the agent sends the drafts it's confident about automatically, and still routes anything uncertain to you for review. Suppression, caps, warmup and domain auth all still apply — nothing goes out unverified.",
    strong: true,
  },
];

export function AutopilotSection({ initial }: { initial: AutopilotState }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<AutopilotState>(initial);

  function toggle(key: keyof AutopilotState) {
    const next = !state[key];
    setState((s) => ({ ...s, [key]: next })); // optimistic
    const payload: Partial<Record<keyof AutopilotState, boolean>> = {};
    payload[key] = next;
    startTransition(async () => {
      const r = await setAutopilotAction(payload);
      if (!r.ok) {
        setState((s) => ({ ...s, [key]: !next })); // revert on failure
        toast(r.error ?? "Couldn't update autopilot.", "error");
      } else {
        toast(next ? "Turned on." : "Turned off.");
      }
      router.refresh();
    });
  }

  return (
    <div className="mb-7">
      <p className="mb-3.5 text-[12px] font-semibold uppercase tracking-[1.6px] text-muted-2">Autopilot</p>
      <div className="rounded-xl2 border border-line bg-white shadow-card">
        {ROWS.map((row, i) => {
          const on = state[row.key];
          return (
            <div
              key={row.key}
              className={`relative flex items-start gap-3.5 p-4 ${i > 0 ? "border-t border-line-2" : ""} ${
                row.strong && on ? "bg-[rgba(232,116,59,0.04)]" : ""
              }`}
            >
              {row.strong && on && <span className="absolute left-0 top-0 h-full w-[3px] bg-ember" />}
              <div className="min-w-0 flex-1">
                <p className="m-0 flex items-center gap-2 font-heading text-[15px] font-semibold text-ink">
                  {row.name}
                  {row.strong && (
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.6px] ${on ? "bg-ember text-white" : "bg-line-2 text-muted-2"}`}>
                      {on ? "Live" : "Full autonomy"}
                    </span>
                  )}
                </p>
                <p className="m-0 text-[12.5px] text-muted-2">{row.desc}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={row.name}
                disabled={pending}
                onClick={() => toggle(row.key)}
                className={`relative mt-0.5 h-6 w-11 flex-none rounded-full transition-colors disabled:opacity-60 ${
                  on ? (row.strong ? "bg-ember" : "bg-sweep") : "bg-line-3"
                }`}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
              </button>
            </div>
          );
        })}
      </div>
      <p className="mt-2.5 text-[12px] text-muted-3">
        Always-on, and reversible anytime. With auto-send off, every draft waits for your approval — autopilot just
        automates the clicks. With it on, the agent sends what it&apos;s confident about and asks you about the rest.
      </p>
    </div>
  );
}
