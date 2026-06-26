"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/auth-helpers";
import { runReflection, applyInsight, vetoInsight } from "@/lib/agent/reflection";
import { reengagementSweep } from "@/lib/agent/maintenance";

export interface ReflectionActionResult {
  ok: boolean;
  error?: string;
  message?: string;
}

/**
 * Run the reflection pass + the silence/follow-up sweep now (both run on the
 * nightly cron in prod). Reflection proposes copy/timing insights; the sweep
 * cools leads that went quiet past the learned follow-up gap so they re-queue.
 */
export async function runReflectionAction(): Promise<ReflectionActionResult> {
  const ctx = await requireOrg();
  const [res, sweep] = await Promise.all([runReflection(ctx.orgId), reengagementSweep(ctx.orgId)]);
  revalidatePath("/agent");
  revalidatePath("/leads");
  revalidatePath("/");
  const parts: string[] = [];
  parts.push(res.created > 0 ? `${res.created} new insight(s)` : res.skipped[0] ?? "no new insights");
  if (sweep.cooled > 0) parts.push(`${sweep.cooled} silent lead(s) re-queued`);
  return { ok: true, message: parts.join(" · ") };
}

export async function applyInsightAction(insightId: string): Promise<ReflectionActionResult> {
  const ctx = await requireOrg();
  const ok = await applyInsight(ctx.orgId, insightId, ctx.userId);
  revalidatePath("/agent");
  revalidatePath("/");
  return ok ? { ok: true, message: "Applied. The agent will use this going forward." } : { ok: false, error: "Insight not found or already decided." };
}

export async function vetoInsightAction(insightId: string): Promise<ReflectionActionResult> {
  const ctx = await requireOrg();
  const ok = await vetoInsight(ctx.orgId, insightId);
  revalidatePath("/agent");
  return ok ? { ok: true, message: "Vetoed — the agent won't make this change." } : { ok: false, error: "Insight not found or already decided." };
}
