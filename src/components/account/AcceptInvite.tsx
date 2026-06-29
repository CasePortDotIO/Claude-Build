"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { acceptInvitationAction } from "@/server/actions/team";
import { toast } from "@/components/ui/Toast";

export function AcceptInvite({ token, orgName }: { token: string; orgName: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function accept() {
    startTransition(async () => {
      const r = await acceptInvitationAction(token);
      if (r.ok) { toast(`Welcome to ${orgName}.`, "success"); router.push("/"); router.refresh(); }
      else toast(r.error ?? "Couldn't accept the invitation.", "error");
    });
  }

  return (
    <button
      onClick={accept}
      disabled={pending}
      className="w-full rounded-lg bg-ember px-5 py-3 font-heading text-[15px] font-semibold text-white hover:bg-ember-hover disabled:opacity-60"
    >
      {pending ? "Joining…" : `Join ${orgName} →`}
    </button>
  );
}
