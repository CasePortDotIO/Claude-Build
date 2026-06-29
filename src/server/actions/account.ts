"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOrg } from "@/lib/auth-helpers";
import { getMailboxProvider, getReadyContext } from "@/lib/mailbox";
import { isBillingConfigured } from "@/lib/billing/stripe";

export interface AccountActionResult {
  ok: boolean;
  error?: string;
  message?: string;
}

/** Best-effort confirmation email to the operator (never blocks the action). */
async function emailOperator(orgId: string, to: string, subject: string, body: string): Promise<void> {
  try {
    const mailbox = await prisma.mailbox.findFirst({ where: { orgId, status: "CONNECTED" }, orderBy: { createdAt: "asc" } });
    if (!mailbox || !to) return;
    await getMailboxProvider(mailbox.provider).send(await getReadyContext(mailbox), { to, subject, body });
  } catch {
    /* ignore */
  }
}

/**
 * §9 one-click cancellation. Fully self-serve, no retention maze, no "contact us".
 * Halts sending immediately (the send pipeline refuses a canceled workspace),
 * confirms on-screen and by email, and is reversed by a single reactivate click.
 * Data is retained per policy and remains exportable.
 */
export async function cancelSubscriptionAction(): Promise<AccountActionResult> {
  const ctx = await requireOrg();
  // When Stripe is live, billing state is owned by Stripe — cancel through the
  // billing portal so the real subscription (and access) actually changes.
  if (await isBillingConfigured()) {
    return { ok: false, error: "Manage your subscription from the billing portal in Account." };
  }
  await prisma.org.update({ where: { id: ctx.orgId }, data: { billingStatus: "canceled", canceledAt: new Date() } });
  await prisma.auditLog.create({
    data: { orgId: ctx.orgId, actorId: ctx.userId, action: "subscription.cancel", targetType: "Org", targetId: ctx.orgId },
  });

  await emailOperator(
    ctx.orgId,
    ctx.email,
    "Your subscription is canceled",
    [
      "Your subscription is canceled, effective now.",
      "",
      "• Sending has stopped — the agent won't email any of your leads.",
      "• Your data is kept and stays exportable from your account.",
      "• You can reactivate anytime in one click; nothing is deleted.",
      "",
      "Thanks for giving it a run.",
    ].join("\n"),
  );

  revalidatePath("/account");
  revalidatePath("/");
  return { ok: true, message: "Canceled. Sending has stopped and a confirmation is on its way." };
}

/** Reverse a cancellation in one click — no friction coming back. */
export async function reactivateSubscriptionAction(): Promise<AccountActionResult> {
  const ctx = await requireOrg();
  // Never grant paid access for free when Stripe is live — reactivation must go
  // through Checkout/portal so an actual subscription exists.
  if (await isBillingConfigured()) {
    return { ok: false, error: "Start your subscription from the billing page to reactivate." };
  }
  await prisma.org.update({ where: { id: ctx.orgId }, data: { billingStatus: "active", canceledAt: null } });
  await prisma.auditLog.create({
    data: { orgId: ctx.orgId, actorId: ctx.userId, action: "subscription.reactivate", targetType: "Org", targetId: ctx.orgId },
  });
  revalidatePath("/account");
  revalidatePath("/");
  return { ok: true, message: "Welcome back — your workspace is active again." };
}
