"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Role } from "@prisma/client";
import { inviteMemberAction, revokeInvitationAction, removeMemberAction } from "@/server/actions/team";
import { toast, toastResult } from "@/components/ui/Toast";

export interface MemberVM { userId: string; name: string | null; email: string; role: Role; isYou: boolean; }
export interface InviteVM { id: string; email: string; role: Role; }

const ROLE_LABEL: Record<Role, string> = { AGENCY_ADMIN: "Agency admin", CLIENT_ADMIN: "Admin", MEMBER: "Member" };

export function TeamSection({ members, invites, isAdmin }: { members: MemberVM[]; invites: InviteVM[]; isAdmin: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("MEMBER");

  function invite() {
    if (!email.trim()) return;
    startTransition(async () => {
      const r = await inviteMemberAction({ email, role });
      if (r.ok) { setEmail(""); toast(r.message ?? "Invitation sent.", "success"); }
      else toast(r.error ?? "Couldn't send invite.", "error");
      router.refresh();
    });
  }
  function run(fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) {
    startTransition(async () => { toastResult(await fn()); router.refresh(); });
  }

  return (
    <div className="mt-6 rounded-xl2 border border-line bg-white p-6 shadow-card">
      <p className="m-0 mb-1 font-heading text-[16px] font-semibold text-ink">Team</p>
      <p className="m-0 mb-5 text-[13px] text-muted">Invite teammates to share the workload. Admins can manage connections, autopilot, and billing.</p>

      {isAdmin && (
        <div className="mb-5 flex flex-wrap items-end gap-2">
          <div className="min-w-[200px] flex-1">
            <label className="mb-1.5 block text-[12px] font-semibold text-ink">Invite by email</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") invite(); }}
              placeholder="teammate@company.com"
              className="w-full rounded-lg border border-line-3 bg-white px-3 py-2 text-[13.5px] outline-none focus:border-sweep focus:ring-2 focus:ring-[rgba(27,122,87,0.12)]"
            />
          </div>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="rounded-lg border border-line-3 bg-white px-3 py-2 text-[13.5px] outline-none focus:border-sweep"
          >
            <option value="MEMBER">Member</option>
            <option value="CLIENT_ADMIN">Admin</option>
          </select>
          <button
            onClick={invite}
            disabled={pending || !email.trim()}
            className="rounded-lg bg-sweep px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Sending…" : "Send invite"}
          </button>
        </div>
      )}

      <div className="flex flex-col">
        {members.map((m) => (
          <div key={m.userId} className="flex items-center justify-between gap-3 border-b border-line-2 py-3 last:border-b-0">
            <div className="min-w-0">
              <p className="m-0 truncate text-[14px] font-semibold text-ink">
                {m.name || m.email}{m.isYou && <span className="ml-1.5 text-[12px] font-normal text-muted-3">(you)</span>}
              </p>
              <p className="m-0 truncate text-[12.5px] text-muted-3">{m.email}</p>
            </div>
            <div className="flex flex-none items-center gap-3">
              <span className="rounded-md bg-cream px-2 py-1 text-[11.5px] font-semibold text-muted-2">{ROLE_LABEL[m.role]}</span>
              {isAdmin && !m.isYou && (
                <button onClick={() => run(() => removeMemberAction(m.userId))} className="text-[12px] font-semibold text-[#b43c3c] hover:underline disabled:opacity-60">Remove</button>
              )}
            </div>
          </div>
        ))}

        {invites.map((i) => (
          <div key={i.id} className="flex items-center justify-between gap-3 border-b border-line-2 py-3 last:border-b-0">
            <div className="min-w-0">
              <p className="m-0 truncate text-[14px] text-ink-soft">{i.email}</p>
              <p className="m-0 text-[12.5px] text-ember">Invitation pending</p>
            </div>
            <div className="flex flex-none items-center gap-3">
              <span className="rounded-md bg-cream px-2 py-1 text-[11.5px] font-semibold text-muted-2">{ROLE_LABEL[i.role]}</span>
              {isAdmin && (
                <button onClick={() => run(() => revokeInvitationAction(i.id))} className="text-[12px] font-semibold text-muted hover:underline disabled:opacity-60">Revoke</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
