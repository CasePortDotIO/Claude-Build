"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordResetAction, type ActionState } from "@/server/actions/auth";

const initial: ActionState = {};

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordResetAction, initial);

  return (
    <div className="ws-rise w-full max-w-[400px]">
      <div className="mb-7 text-center">
        <h1 className="m-0 font-heading text-[27px] font-semibold tracking-[-0.4px] text-ink">Reset your password</h1>
        <p className="m-0 mt-1.5 text-[13.5px] text-muted">We&apos;ll email you a link to choose a new one.</p>
      </div>

      {state.ok ? (
        <div className="rounded-xl2 border border-[rgba(27,122,87,0.25)] bg-sweep-mist p-6 text-center shadow-pop">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-sweep text-white">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16v16H4z" opacity="0" /><path d="M22 6l-10 7L2 6" /><path d="M2 6h20v12H2z" /></svg>
          </div>
          <p className="m-0 mb-1.5 font-heading text-[15px] font-semibold text-ink">Check your inbox</p>
          <p className="m-0 text-[13.5px] leading-[1.55] text-muted">
            If an account exists for that email, a reset link is on its way. The link expires in an hour.
          </p>
        </div>
      ) : (
        <form action={formAction} className="rounded-xl2 border border-line bg-white p-7 shadow-pop">
          {state.error && (
            <div className="mb-4 rounded-lg border border-[#f0d2c9] bg-[#fbf0ec] px-4 py-3 text-[13px] text-[#a14a2c]">{state.error}</div>
          )}
          <label className="mb-1.5 block text-[13px] font-semibold text-ink">Email</label>
          <input
            name="email"
            type="email"
            required
            placeholder="you@business.com"
            className="mb-4 w-full rounded-lg border border-line-3 bg-white px-3.5 py-2.5 text-[14.5px] outline-none focus:border-sweep focus:ring-2 focus:ring-[rgba(27,122,87,0.12)]"
          />
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-ember px-5 py-3 font-heading text-[15px] font-semibold text-white hover:bg-ember-hover disabled:opacity-60"
          >
            {pending ? "Sending…" : "Send reset link →"}
          </button>
        </form>
      )}

      <p className="mt-5 text-center text-[13.5px] text-muted">
        <Link href="/sign-in" className="font-semibold text-sweep hover:underline">← Back to sign in</Link>
      </p>
    </div>
  );
}
