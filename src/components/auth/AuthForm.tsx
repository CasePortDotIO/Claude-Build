"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";
import { signUpAction, signInAction, type ActionState } from "@/server/actions/auth";

const initial: ActionState = {};

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
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
    <div className="w-full max-w-[400px]">
      <div className="mb-7 text-center">
        <p className="m-0 mb-1 font-heading text-[15px] font-semibold text-sweep">Coach. Don&apos;t Chase.</p>
        <h1 className="m-0 font-heading text-[26px] font-semibold tracking-[-0.4px] text-ink">
          {mode === "sign-up" ? "Create your workspace" : "Welcome back"}
        </h1>
        <p className="m-0 mt-1.5 text-[13.5px] text-muted">The Warm Sweep™ · by Delegate and Done</p>
      </div>

      <form action={formAction} className="rounded-xl2 border border-line bg-white p-7">
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

        <button
          type="submit"
          disabled={pending}
          className="mt-2 w-full rounded-lg bg-ember px-5 py-3 font-heading text-[15px] font-semibold text-white hover:bg-ember-hover disabled:opacity-60"
        >
          {pending ? "Please wait…" : mode === "sign-up" ? "Create workspace →" : "Sign in →"}
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
  return (
    <div className="mb-4">
      <label className="mb-1.5 block text-[13px] font-semibold text-ink">{label}</label>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        required
        className="w-full rounded-lg border border-line-3 bg-white px-3.5 py-2.5 text-[14.5px] outline-none focus:border-sweep focus:ring-2 focus:ring-[rgba(27,122,87,0.12)]"
      />
    </div>
  );
}
