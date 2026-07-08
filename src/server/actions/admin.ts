"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOrg } from "@/lib/auth-helpers";
import { isSuperadmin } from "@/lib/auth/superadmin";
import { PLAN_LIMITS } from "@/lib/billing/entitlements";
import type { Prisma } from "@prisma/client";

export interface AdminResult {
  ok: boolean;
  error?: string;
  message?: string;
}

/** Every admin action re-checks superadmin server-side (defense in depth). */
async function assertSuperadmin(): Promise<{ userId: string; email: string } | null> {
  const ctx = await requireOrg();
  if (!isSuperadmin(ctx.email)) return null;
  return { userId: ctx.userId, email: ctx.email };
}

async function audit(actorId: string, orgId: string, action: string, metadata?: Prisma.InputJsonValue) {
  await prisma.auditLog.create({ data: { orgId, actorId, action, targetType: "Org", targetId: orgId, metadata: metadata ?? {} } });
}

const done = (message: string): AdminResult => {
  revalidatePath("/admin/orgs");
  return { ok: true, message };
};
const denied: AdminResult = { ok: false, error: "Not authorized." };

/** Override a workspace's tier. "AUTO" clears the override (derive from billing). */
export async function setTierAction(orgId: string, tier: string): Promise<AdminResult> {
  const su = await assertSuperadmin();
  if (!su) return denied;
  const planTier = tier === "AUTO" ? null : tier;
  if (planTier !== null && !(planTier in PLAN_LIMITS)) return { ok: false, error: "Unknown tier." };
  await prisma.org.update({ where: { id: orgId }, data: { planTier } });
  await audit(su.userId, orgId, "admin.setTier", { tier });
  return done(`Tier set to ${tier}.`);
}

/** Comp a workspace: full free access (active + CONTINUITY). */
export async function grantAccessAction(orgId: string): Promise<AdminResult> {
  const su = await assertSuperadmin();
  if (!su) return denied;
  await prisma.org.update({ where: { id: orgId }, data: { billingStatus: "active", planTier: "CONTINUITY", canceledAt: null } });
  await audit(su.userId, orgId, "admin.grantAccess");
  return done("Access granted (comped).");
}

/** Freeze a workspace — walled behind /billing until restored. */
export async function suspendAction(orgId: string): Promise<AdminResult> {
  const su = await assertSuperadmin();
  if (!su) return denied;
  await prisma.org.update({ where: { id: orgId }, data: { billingStatus: "paused" } });
  await audit(su.userId, orgId, "admin.suspend");
  return done("Workspace suspended.");
}

/** Restore a suspended workspace to active. */
export async function restoreAction(orgId: string): Promise<AdminResult> {
  const su = await assertSuperadmin();
  if (!su) return denied;
  await prisma.org.update({ where: { id: orgId }, data: { billingStatus: "active", canceledAt: null } });
  await audit(su.userId, orgId, "admin.restore");
  return done("Workspace restored.");
}

/** Reset this period's draft meter — immediate headroom under the plan cap. */
export async function resetMeterAction(orgId: string): Promise<AdminResult> {
  const su = await assertSuperadmin();
  if (!su) return denied;
  await prisma.org.update({ where: { id: orgId }, data: { leadsDraftedThisPeriod: 0, meterPeriodStart: new Date() } });
  await audit(su.userId, orgId, "admin.resetMeter");
  return done("Usage meter reset.");
}

/**
 * Clear owed guarantee free-month credits — after you've applied them in Stripe.
 * Records the action; does not itself move money.
 */
export async function clearGuaranteeCreditAction(orgId: string): Promise<AdminResult> {
  const su = await assertSuperadmin();
  if (!su) return denied;
  await prisma.org.update({ where: { id: orgId }, data: { guaranteeCreditMonths: 0 } });
  await audit(su.userId, orgId, "admin.clearGuaranteeCredit");
  return done("Guarantee credits cleared.");
}
