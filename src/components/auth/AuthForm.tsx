"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signUpAction, signInAction, type ActionState } from "@/server/actions/auth";
import { SpinnerLabel } from "@/components/ui/Spinner";

const initial: ActionState = {};

export function AuthForm({ mode, notice = null }: { mode: "sign-in" | "sign-up"; notice?: string | null }) {
  const router = useRouter();
  const action = mode === "sign-up" ? signUpAction : signInAction;
  const [state, formAction, pending] = useActionState(action, initial);

  // On success, the server action established the session cookie; navigate in.
  // New sign-ups land in the focused setup wizard (connect email + calendar);
  // returning sign-ins go straight to the ready dashboard.
  useEffect(() => {
    if (state.ok) {
      router.push(mode === "sign-up" ? "/welcome" : "/");
      router.refresh();
    }
  }, [state.ok, router, mode]);

  return (
    <div className="ws-rise w-full max-w-[400px]">
      <div className="mb-7 text-center">
        {/* compact wordmark — the desktop brand panel carries this, so hide there */}
        <p className="m-0 mb-1 font-heading text-[15px] font-semibold text-sweep lg:hidden">Coach. Don&apos;t Chase.</p>
        <h1 className="m-0 font-heading text-[27px] font-semibold tracking-[-0.4px] text-ink">
          {mode === "sign-up" ? "Create your workspace" : "Welcome back"}
        </h1>
        <p className="m-0 mt-1.5 text-[13.5px] text-muted">
          {mode === "sign-up" ? "Set up in about two minutes." : "The Warm Sweep™ · by Delegate and Done"}
        </p>
      </div>

      {notice && (
        <div className="mb-4 rounded-lg border border-[rgba(27,122,87,0.25)] bg-sweep-mist px-4 py-3 text-[13px] text-sweep">
          {notice}
        </div>
      )}

      <form action={formAction} className="rounded-xl2 border border-line bg-white p-7 shadow-pop">
        {state.error && (
          <div className="mb-4 rounded-lg border border-[#f0d2c9] bg-[#fbf0ec] px-4 py-3 text-[13px] text-[#a14a2c]">
            {state.error}
          </div>
        )}

        {mode === "sign-up" && (
          <>
            <Field label="Your name" name="name" type="text" placeholder="Jessica Monroe" />
            <Field label="Workspace name" name="orgName" type="text" placeholder="Monroe Coaching" />
          </>
        )}
        <Field label="Email" name="email" type="email" placeholder="you@business.com" />
        <Field
          label="Password"
          name="password"
          type="password"
          placeholder={mode === "sign-up" ? "At least 8 characters" : "Your password"}
        />

        {mode === "sign-in" && (
          <div className="-mt-1 mb-4 text-right">
            <Link href="/forgot-password" className="text-[12.5px] font-semibold text-muted hover:text-sweep hover:underline">
              Forgot password?
            </Link>
          </div>
        )}

        <button
          type="submit"
          disabled={pending}
          className="mt-2 w-full rounded-lg bg-ember px-5 py-3 font-heading text-[15px] font-semibold text-white hover:bg-ember-hover disabled:opacity-60"
        >
          {pending ? <SpinnerLabel>Please wait…</SpinnerLabel> : mode === "sign-up" ? "Create workspace →" : "Sign in →"}
        </button>
      </form>

      <p className="mt-5 text-center text-[13.5px] text-muted">
        {mode === "sign-up" ? (
          <>
            Already have an account?{" "}
            <Link href="/sign-in" className="font-semibold text-sweep hover:underline">
              Sign in
            </Link>
          </>
        ) : (
          <>
            New here?{" "}
            <Link href="/sign-up" className="font-semibold text-sweep hover:underline">
              Create a workspace
            </Link>
          </>
        )}
      </p>
    </div>
  );
}

function Field({
  label,
  name,
  type,
  placeholder,
}: {
  label: string;
  name: string;
  type: string;
  placeholder?: string;
}) {
  const [reveal, setReveal] = useState(false);
  const isPassword = type === "password";
  const inputType = isPassword && reveal ? "text" : type;
  return (
    <div className="mb-4">
      <label className="mb-1.5 block text-[13px] font-semibold text-ink">{label}</label>
      <div className="relative">
        <input
          name={name}
          type={inputType}
          placeholder={placeholder}
          required
          className={`w-full rounded-lg border border-line-3 bg-white py-2.5 pl-3.5 text-[14.5px] outline-none focus:border-sweep focus:ring-2 focus:ring-[rgba(27,122,87,0.12)] ${isPassword ? "pr-11" : "pr-3.5"}`}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setReveal((v) => !v)}
            aria-label={reveal ? "Hide password" : "Show password"}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted-3 hover:text-muted"
          >
            {reveal ? (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22" /></svg>
            ) : (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
