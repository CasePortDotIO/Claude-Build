"use server";

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signInSchema, signUpSchema, forgotPasswordSchema, resetPasswordSchema } from "@/lib/zod/org";
import { signIn } from "@/lib/auth";
import { createAuthToken, consumeAuthToken } from "@/lib/auth/tokens";
import { sendPasswordResetEmail, sendVerificationEmail } from "@/lib/email/auth-emails";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { isCompedEmail } from "@/lib/billing/comp";
import { isDisposableEmail } from "@/lib/auth/email-guard";

const MIN = 60_000;

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "workspace"
  );
}

export interface ActionState {
  error?: string;
  ok?: boolean;
}

/**
 * Sign up = create User + Org + Membership(CLIENT_ADMIN) atomically, then log in.
 * The new org is a standalone CLIENT workspace (no parent agency in v1 sign-up).
 */
export async function signUpAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const limit = await rateLimit(`signup:${await clientIp()}`, 5, 60 * MIN);
  if (!limit.allowed) return { error: "Too many sign-up attempts. Please try again later." };

  // Honeypot: a field hidden from humans but filled by naive bots. If it has any
  // value, treat as a bot and stop — with a generic message, no hint it's a trap.
  if ((formData.get("company_website") as string)?.trim()) {
    return { error: "Something went wrong. Please try again." };
  }

  const parsed = signUpSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    orgName: formData.get("orgName"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { name, email, password, orgName } = parsed.data;

  // Block throwaway/disposable inboxes — the fastest route to spam complaints
  // that could get the shared mailbox OAuth app suspended for everyone.
  if (isDisposableEmail(email)) {
    return { error: "Please sign up with a permanent work email — disposable inboxes aren't supported." };
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { error: "An account with that email already exists." };

  const passwordHash = await bcrypt.hash(password, 10);

  // Unique slug: append a short suffix on collision.
  let slug = slugify(orgName);
  if (await prisma.org.findUnique({ where: { slug } })) {
    slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
  }

  // Private-beta comp: invited testers (TRIAL_COMP_EMAILS) start on a free trial
  // so they sail past the paid-only paywall; everyone else starts "incomplete".
  // Comps also get the full CONTINUITY tier so entitlement gates don't cap the
  // beta experience to the fallback TRIAL limits.
  const comped = isCompedEmail(email);
  const billingStatus = comped ? "trial" : undefined;

  const orgId = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { name, email, passwordHash } });
    const org = await tx.org.create({ data: { name: orgName, slug, type: "CLIENT", ...(billingStatus ? { billingStatus } : {}), ...(comped ? { planTier: "CONTINUITY" } : {}) } });
    await tx.membership.create({ data: { userId: user.id, orgId: org.id, role: "CLIENT_ADMIN" } });
    await tx.auditLog.create({
      data: { orgId: org.id, actorId: user.id, action: "org.create", targetType: "Org", targetId: org.id },
    });
    return org.id;
  });

  // New workspaces start EMPTY — real users never see fabricated leads/bookings
  // or sample numbers in their KPIs. Sample data is opt-in only, via the
  // "Load sample data" button on the empty Command Center.

  // Send a verification email (non-blocking — they can use the app meanwhile).
  try {
    const u = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (u) await sendVerificationEmail(email, await createAuthToken(u.id, "EMAIL_VERIFY"));
  } catch (err) {
    console.error("verification email failed (non-fatal):", err);
  }

  // signIn with redirect handled by the caller's redirect on success.
  await signIn("credentials", { email, password, redirect: false });
  return { ok: true };
}

/**
 * Request a password reset. Always reports success — never reveal whether an
 * email is registered (anti-enumeration). Only sends a link if the account
 * exists and has a password (not an OAuth-only account).
 */
export async function requestPasswordResetAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const limit = await rateLimit(`pwreset:${await clientIp()}`, 5, 60 * MIN);
  if (!limit.allowed) return { ok: true }; // silently throttle (don't reveal anything)

  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email }, select: { id: true, passwordHash: true } });
  if (user?.passwordHash) {
    try {
      const token = await createAuthToken(user.id, "PASSWORD_RESET");
      await sendPasswordResetEmail(parsed.data.email, token);
    } catch (err) {
      console.error("password reset email failed:", err);
    }
  }
  return { ok: true };
}

/** Complete a password reset using a valid, unexpired, single-use token. */
export async function resetPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = resetPasswordSchema.safeParse({ token: formData.get("token"), password: formData.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const userId = await consumeAuthToken(parsed.data.token, "PASSWORD_RESET");
  if (!userId) return { error: "This reset link is invalid or has expired. Request a new one." };

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  return { ok: true };
}

export async function signInAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const limit = await rateLimit(`signin:${await clientIp()}`, 10, 10 * MIN);
  if (!limit.allowed) return { error: "Too many attempts. Please wait a few minutes and try again." };

  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  try {
    await signIn("credentials", { ...parsed.data, redirect: false });
    return { ok: true };
  } catch {
    return { error: "Invalid email or password." };
  }
}
