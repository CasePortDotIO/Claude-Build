"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/auth-helpers";
import { runReflection, applyInsight, vetoInsight } from "@/lib/agent/reflection";

export interface ReflectionActionResult {
  ok: boolean;
  error?: string;
  message?: string;
}

/** Run the reflection pass now (the nightly job is triggered on a schedule in prod). */
export async function runReflectionAction(): Promise<ReflectionActionResult> {
  const ctx = await requireOrg();
  const res = await runReflection(ctx.orgId);
  revalidatePath("/agent");
  revalidatePath("/");
  return {
    ok: true,
    message: res.created > 0 ? `Reflection found ${res.created} new insight(s).` : res.skipped[0] ?? "No new insights — nothing to change.",
  };
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
