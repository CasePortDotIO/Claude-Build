"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOrg, assertRole } from "@/lib/auth-helpers";
import { setBookingLinkAction } from "@/server/actions/calendar";
import { pickQuickWins, type QuickWin } from "@/lib/onboarding";

export interface IntakeResult {
  ok: boolean;
  error?: string;
  quickWins?: QuickWin[];
}

/**
 * Submit the onboarding intake (p8): persist the ideal-client description and
 * (optionally) the booking link, stamp the submission time that anchors the
 * activation SLAs, and reveal the 3 quick-win leads. "The moment you submit
 * intake, your sweep starts building itself" — the drafting/Speed-to-Lead crons
 * pick up the imported leads from here; the quick-wins are the instant proof.
 */
export async function submitIntakeAction(opts: { idealClient?: string; bookingLink?: string }): Promise<IntakeResult> {
  const ctx = await requireOrg();
  try {
    assertRole(ctx, "CLIENT_ADMIN");
  } catch {
    return { ok: false, error: "Only an admin can complete setup." };
  }

  const idealClient = opts.idealClient?.trim() || null;
  if (!idealClient) return { ok: false, error: "Tell us who your ideal client is (a sentence is plenty)." };

  // Best-effort booking link (reuses the calendar LINK provider path).
  const link = opts.bookingLink?.trim();
  if (link) {
    const r = await setBookingLinkAction({ bookingLink: link });
    if (!r.ok) return { ok: false, error: r.error ?? "That booking link didn't look right." };
  }

  await prisma.org.update({
    where: { id: ctx.orgId },
    data: { idealClient, onboardingSubmittedAt: new Date() },
  });
  await prisma.auditLog.create({
    data: { orgId: ctx.orgId, actorId: ctx.userId, action: "onboarding.intake", targetType: "Org", targetId: ctx.orgId },
  });

  revalidatePath("/");
  return { ok: true, quickWins: await pickQuickWins(ctx.orgId) };
}
