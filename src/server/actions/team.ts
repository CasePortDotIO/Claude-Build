"use server";

import { revalidatePath } from "next/cache";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireOrg, assertRole } from "@/lib/auth-helpers";
import { hashToken, newRawToken } from "@/lib/auth/tokens";
import { sendInviteEmail } from "@/lib/email/auth-emails";

export interface TeamActionResult {
  ok: boolean;
  error?: string;
  message?: string;
}

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const INVITABLE_ROLES: Role[] = ["MEMBER", "CLIENT_ADMIN"];

/** Invite someone to the active org. Admin-only. Re-invites refresh the token. */
export async function inviteMemberAction(opts: { email: string; role: Role }): Promise<TeamActionResult> {
  const ctx = await requireOrg();
  try {
    assertRole(ctx, "CLIENT_ADMIN");
  } catch {
    return { ok: false, error: "Only an admin can invite teammates." };
  }

  const email = opts.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: "Enter a valid email." };
  const role: Role = INVITABLE_ROLES.includes(opts.role) ? opts.role : "MEMBER";

  // Already a member? (look up by the user's existing membership in this org)
  const existingUser = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existingUser) {
    const member = await prisma.membership.findUnique({ where: { userId_orgId: { userId: existingUser.id, orgId: ctx.orgId } } });
    if (member) return { ok: false, error: "They're already on your team." };
  }

  const raw = newRawToken();
  const org = await prisma.org.findUnique({ where: { id: ctx.orgId }, select: { name: true, brandName: true } });
  await prisma.invitation.upsert({
    where: { orgId_email: { orgId: ctx.orgId, email } },
    create: { orgId: ctx.orgId, email, role, tokenHash: hashToken(raw), invitedById: ctx.userId, expiresAt: new Date(Date.now() + INVITE_TTL_MS) },
    update: { role, tokenHash: hashToken(raw), invitedById: ctx.userId, expiresAt: new Date(Date.now() + INVITE_TTL_MS), acceptedAt: null },
  });

  await sendInviteEmail({ to: email, orgName: org?.brandName || org?.name || "the team", inviterName: ctx.name, rawToken: raw });
  revalidatePath("/account");
  return { ok: true, message: `Invitation sent to ${email}.` };
}

/** Revoke a pending invitation. Admin-only. */
export async function revokeInvitationAction(invitationId: string): Promise<TeamActionResult> {
  const ctx = await requireOrg();
  try {
    assertRole(ctx, "CLIENT_ADMIN");
  } catch {
    return { ok: false, error: "Only an admin can manage invitations." };
  }
  await prisma.invitation.deleteMany({ where: { id: invitationId, orgId: ctx.orgId, acceptedAt: null } });
  revalidatePath("/account");
  return { ok: true, message: "Invitation revoked." };
}

/** Remove a teammate from the org. Admin-only; can't remove the last admin or yourself. */
export async function removeMemberAction(userId: string): Promise<TeamActionResult> {
  const ctx = await requireOrg();
  try {
    assertRole(ctx, "CLIENT_ADMIN");
  } catch {
    return { ok: false, error: "Only an admin can remove teammates." };
  }
  if (userId === ctx.userId) return { ok: false, error: "You can't remove yourself." };

  const admins = await prisma.membership.count({ where: { orgId: ctx.orgId, role: { in: ["CLIENT_ADMIN", "AGENCY_ADMIN"] } } });
  const target = await prisma.membership.findUnique({ where: { userId_orgId: { userId, orgId: ctx.orgId } }, select: { role: true } });
  if (target && ["CLIENT_ADMIN", "AGENCY_ADMIN"].includes(target.role) && admins <= 1) {
    return { ok: false, error: "Can't remove the last admin." };
  }

  await prisma.membership.deleteMany({ where: { userId, orgId: ctx.orgId } });
  revalidatePath("/account");
  return { ok: true, message: "Teammate removed." };
}

/**
 * Accept an invitation as the signed-in user. The user's email must match the
 * invited address. Creates (or no-ops) the membership and marks the invite used.
 */
export async function acceptInvitationAction(rawToken: string): Promise<TeamActionResult & { orgId?: string }> {
  const ctx = await requireOrg();
  const invite = await prisma.invitation.findUnique({ where: { tokenHash: hashToken(rawToken) } });
  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
    return { ok: false, error: "This invitation is invalid or has expired." };
  }
  if (invite.email.toLowerCase() !== ctx.email.toLowerCase()) {
    return { ok: false, error: `This invitation is for ${invite.email}. Sign in with that email to accept.` };
  }

  await prisma.$transaction([
    prisma.membership.upsert({
      where: { userId_orgId: { userId: ctx.userId, orgId: invite.orgId } },
      create: { userId: ctx.userId, orgId: invite.orgId, role: invite.role },
      update: {},
    }),
    prisma.invitation.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } }),
  ]);
  return { ok: true, message: "You're in.", orgId: invite.orgId };
}
