"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOrg } from "@/lib/auth-helpers";
import { assertRole } from "@/lib/roles";

export interface AutopilotActionResult {
  ok: boolean;
  error?: string;
  message?: string;
}

/**
 * Toggle the workspace's autopilot capabilities (M17). Admin-only — flipping
 * always-on sync/draft/send is a trust decision, not a member action. Each flag
 * is optional so the UI can toggle one at a time. Enabling sync also serves as
 * the standing prior-contact attestation for connected sources.
 */
export async function setAutopilotAction(opts: {
  sync?: boolean;
  draft?: boolean;
  send?: boolean;
}): Promise<AutopilotActionResult> {
  const ctx = await requireOrg();
  try {
    assertRole(ctx, "CLIENT_ADMIN");
  } catch {
    return { ok: false, error: "Only an admin can change autopilot." };
  }

  await prisma.org.update({
    where: { id: ctx.orgId },
    data: {
      ...(opts.sync !== undefined ? { autopilotSync: opts.sync } : {}),
      ...(opts.draft !== undefined ? { autopilotDraft: opts.draft } : {}),
      ...(opts.send !== undefined ? { autopilotSend: opts.send } : {}),
    },
  });

  await prisma.auditLog.create({
    data: {
      orgId: ctx.orgId,
      actorId: ctx.userId,
      action: "autopilot.set",
      targetType: "Org",
      targetId: ctx.orgId,
      metadata: { ...opts },
    },
  });

  revalidatePath("/connections");
  revalidatePath("/");
  return { ok: true, message: "Autopilot updated." };
}
