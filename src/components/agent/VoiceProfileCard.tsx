"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { learnVoiceAction, editVoiceProfileAction } from "@/server/actions/agent";
import { toast, toastResult } from "@/components/ui/Toast";

export interface VoiceVM {
  tone: string;
  sentenceLength: string;
  emojiUse: string;
  greeting: string;
  signOff: string;
  signatureMove: string;
  summary: string | null;
  sampleCount: number;
  source: string;
}

const ROWS: { key: keyof VoiceVM; label: string }[] = [
  { key: "tone", label: "Tone" },
  { key: "sentenceLength", label: "Sentence length" },
  { key: "emojiUse", label: "Emoji" },
  { key: "greeting", label: "Greeting" },
  { key: "signOff", label: "Sign-off" },
  { key: "signatureMove", label: "Signature move" },
];

export function VoiceProfileCard({ voice }: { voice: VoiceVM }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<"view" | "edit" | "learn">("view");
  const [draft, setDraft] = useState(voice);
  const [samples, setSamples] = useState("");

  function save() {
    startTransition(async () => {
      const r = await editVoiceProfileAction({
        tone: draft.tone,
        sentenceLength: draft.sentenceLength,
        emojiUse: draft.emojiUse,
        greeting: draft.greeting,
        signOff: draft.signOff,
        signatureMove: draft.signatureMove,
        summary: draft.summary ?? undefined,
      });
      toastResult(r, "Saved");
      if (r.ok) { setMode("view"); router.refresh(); }
    });
  }

  function learn() {
    // Split pasted emails on a blank-line-delimited "---" or double newline.
    const blocks = samples
      .split(/\n-{3,}\n|\n\s*\n\s*\n/)
      .map((b) => b.trim())
      .filter(Boolean)
      .map((body) => ({ body }));
    if (blocks.length === 0) { toast("Paste at least one email.", "error"); return; }
    startTransition(async () => {
      const r = await learnVoiceAction({ samples: blocks });
      toastResult(r, "Learned");
      if (r.ok) { setMode("view"); setSamples(""); router.refresh(); }
    });
  }

  return (
    <div className="rounded-xl2 border border-line bg-white p-7">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <p className="m-0 text-[12px] font-semibold uppercase tracking-[1.6px] text-muted-2">Your voice profile</p>
          <p className="m-0 mt-1 text-[12.5px] text-muted-3">
            {voice.source === "default"
              ? "Using defaults — learn from your past emails to personalize."
              : `${voice.source === "learned" ? "Learned" : "Edited"} · from ${voice.sampleCount} sample${voice.sampleCount === 1 ? "" : "s"}`}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setMode(mode === "learn" ? "view" : "learn")} className="rounded-lg bg-ember px-3 py-2 text-[12.5px] font-semibold text-white hover:bg-ember-hover">
            Learn from emails
          </button>
          <button onClick={() => { setDraft(voice); setMode(mode === "edit" ? "view" : "edit"); }} className="rounded-lg border border-line-3 bg-white px-3 py-2 text-[12.5px] font-semibold text-muted hover:bg-cream">
            {mode === "edit" ? "Cancel" : "Edit"}
          </button>
        </div>
      </div>

      {mode === "learn" ? (
        <div>
          <p className="mb-2 text-[13px] text-muted">
            Paste 10–20 of your real past emails, separated by a line with <code className="font-mono">---</code> or a blank line. The agent learns your tone, length, greeting, and sign-off — and stores them as voice memory.
          </p>
          <textarea
            value={samples}
            onChange={(e) => setSamples(e.target.value)}
            rows={12}
            placeholder={"Hi Dana,\n\nLoved our chat about pricing your packages...\n\n— Jess\n---\nHey Phil,\n..."}
            className="mb-3 w-full resize-y rounded-lg border border-line-3 bg-cream px-4 py-3 font-sans text-[13.5px] leading-[1.6] outline-none focus:border-sweep"
          />
          <button disabled={pending} onClick={learn} className="rounded-lg bg-sweep px-5 py-3 font-heading text-[14px] font-semibold text-white hover:opacity-90 disabled:opacity-60">
            {pending ? "Learning…" : "Learn my voice →"}
          </button>
        </div>
      ) : mode === "edit" ? (
        <div className="flex flex-col gap-3">
          {ROWS.map((r) => (
            <div key={r.key} className="flex items-center gap-3">
              <label className="w-[130px] flex-none text-[13px] text-muted">{r.label}</label>
              <input
                value={String(draft[r.key] ?? "")}
                onChange={(e) => setDraft({ ...draft, [r.key]: e.target.value })}
                className="flex-1 rounded-lg border border-line-3 bg-white px-3 py-2 text-[13.5px] outline-none focus:border-sweep"
              />
            </div>
          ))}
          <button disabled={pending} onClick={save} className="mt-2 self-start rounded-lg bg-sweep px-5 py-2.5 font-heading text-[13.5px] font-semibold text-white hover:opacity-90 disabled:opacity-60">
            {pending ? "Saving…" : "Save profile"}
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3.5">
            {ROWS.map((r) => (
              <div key={r.key} className="flex items-center justify-between gap-4">
                <span className="text-[14px] text-muted">{r.label}</span>
                <span className="text-right text-[14px] font-semibold text-ink">{String(voice[r.key])}</span>
              </div>
            ))}
          </div>
          {voice.summary && (
            <div className="mt-4 rounded-lg bg-cream px-4 py-3">
              <p className="m-0 text-[13px] italic leading-[1.55] text-muted-2">{voice.summary}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
