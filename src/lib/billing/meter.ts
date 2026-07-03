import { prisma } from "@/lib/prisma";
import { DraftGuardError } from "@/lib/agent/draft-errors";
import { planLimits, meterPeriodElapsed, meteringActive } from "@/lib/billing/entitlements";

/**
 * Fresh-lead draft meter — the margin kill-switch. Enforced at the single draft
 * chokepoint so no path (interactive, autopilot inline, or batch) can push an
 * org past its tier's hard cap and blow the LLM-cost budget.
 *
 * Unmetered when billing isn't configured (local/dev/CI) so tests and setup run
 * freely — mirrors the paywall gate.
 */

/** Throw if the org is at its hard cap this period. Call before drafting. */
export async function assertDraftAllowed(orgId: string): Promise<void> {
  if (!(await meteringActive())) return;
  const org = await prisma.org.findUnique({
    where: { id: orgId },
    select: { planTier: true, billingStatus: true, leadsDraftedThisPeriod: true, meterPeriodStart: true },
  });
  if (!org) return;
  const used = meterPeriodElapsed(org.meterPeriodStart, new Date()) ? 0 : org.leadsDraftedThisPeriod;
  const { monthlyLeadsHard } = planLimits(org);
  if (used >= monthlyLeadsHard) {
    throw new DraftGuardError(
      "This month's processing limit is reached for your plan — upgrade to keep the agent working, or it resumes next month.",
    );
  }
}

/**
 * Count one billed draft against the meter. Call only after a real (LLM) draft
 * succeeds — stub/fallback drafts are free and don't count. Rolls the period
 * over at the start of a new calendar month.
 */
export async function recordDraft(orgId: string): Promise<void> {
  if (!(await meteringActive())) return;
  const org = await prisma.org.findUnique({ where: { id: orgId }, select: { meterPeriodStart: true } });
  if (!org) return;
  if (meterPeriodElapsed(org.meterPeriodStart, new Date())) {
    await prisma.org.update({ where: { id: orgId }, data: { leadsDraftedThisPeriod: 1, meterPeriodStart: new Date() } });
  } else {
    await prisma.org.update({ where: { id: orgId }, data: { leadsDraftedThisPeriod: { increment: 1 } } });
  }
}
