"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { resetPasswordAction, type ActionState } from "@/server/actions/auth";
import { SpinnerLabel } from "@/components/ui/Spinner";

const initial: ActionState = {};

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(resetPasswordAction, initial);
  const [reveal, setReveal] = useState(false);

  useEffect(() => {
    if (state.ok) {
      const t = setTimeout(() => router.push("/sign-in?reset=1"), 1400);
      return () => clearTimeout(t);
    }
  }, [state.ok, router]);

  return (
    <div className="ws-rise w-full max-w-[400px]">
      <div className="mb-7 text-center">
        <h1 className="m-0 font-heading text-[27px] font-semibold tracking-[-0.4px] text-ink">Choose a new password</h1>
        <p className="m-0 mt-1.5 text-[13.5px] text-muted">Pick something at least 8 characters.</p>
      </div>

      {state.ok ? (
        <div className="rounded-xl2 border border-[rgba(27,122,87,0.25)] bg-sweep-mist p-6 text-center shadow-pop">
          <p className="m-0 font-heading text-[15px] font-semibold text-sweep">Password updated</p>
          <p className="m-0 mt-1 text-[13.5px] text-muted">Taking you to sign in…</p>
        </div>
      ) : (
        <form action={formAction} className="rounded-xl2 border border-line bg-white p-7 shadow-pop">
          <input type="hidden" name="token" value={token} />
          {state.error && (
            <div className="mb-4 rounded-lg border border-[#f0d2c9] bg-[#fbf0ec] px-4 py-3 text-[13px] text-[#a14a2c]">{state.error}</div>
          )}
          <label className="mb-1.5 block text-[13px] font-semibold text-ink">New password</label>
          <div className="relative mb-4">
            <input
              name="password"
              type={reveal ? "text" : "password"}
              required
              placeholder="At least 8 characters"
              className="w-full rounded-lg border border-line-3 bg-white py-2.5 pl-3.5 pr-11 text-[14.5px] outline-none focus:border-sweep focus:ring-2 focus:ring-[rgba(27,122,87,0.12)]"
            />
            <button
              type="button"
              onClick={() => setReveal((v) => !v)}
              aria-label={reveal ? "Hide password" : "Show password"}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted-3 hover:text-muted"
            >
              {reveal ? (
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M1 1l22 22" /></svg>
              ) : (
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
              )}
            </button>
          </div>
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-ember px-5 py-3 font-heading text-[15px] font-semibold text-white hover:bg-ember-hover disabled:opacity-60"
          >
            {pending ? <SpinnerLabel>Updating…</SpinnerLabel> : "Update password →"}
          </button>
        </form>
      )}

      <p className="mt-5 text-center text-[13.5px] text-muted">
        <Link href="/sign-in" className="font-semibold text-sweep hover:underline">← Back to sign in</Link>
      </p>
    </div>
  );
}
