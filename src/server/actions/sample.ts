"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/auth-helpers";
import { clearSampleData, seedSampleData } from "@/lib/sample/seed";
import { withDbRetry } from "@/lib/prisma";

export interface SampleActionResult {
  ok: boolean;
  error?: string;
  message?: string;
}

const SAMPLE_PATHS = ["/", "/leads", "/approvals", "/conversations", "/connections"];

/**
 * Load the alive-from-zero sample data on demand — for workspaces created before
 * sample-seeding existed, or anyone who wants to explore the product populated.
 * Idempotent (seedSampleData no-ops if samples already exist).
 */
export async function loadSampleDataAction(): Promise<SampleActionResult> {
  const ctx = await requireOrg();
  try {
    await withDbRetry(() => seedSampleData({ orgId: ctx.orgId, operatorName: ctx.name ?? "there" }));
    for (const p of SAMPLE_PATHS) revalidatePath(p);
    return { ok: true, message: "Sample data loaded — explore away." };
  } catch (err) {
    console.error("loadSampleData failed:", err);
    return { ok: false, error: "Couldn't load sample data — try again." };
  }
}

/** Remove the alive-from-zero sample data once the operator brings their own leads. */
export async function clearSampleDataAction(): Promise<SampleActionResult> {
  const ctx = await requireOrg();
  try {
    const removed = await withDbRetry(() => clearSampleData(ctx.orgId));
    // The sample data touches every screen — refresh them all.
    for (const p of SAMPLE_PATHS) revalidatePath(p);
    return { ok: true, message: removed > 0 ? "Sample data cleared." : "No sample data to clear." };
  } catch (err) {
    console.error("clearSampleData failed:", err);
    return { ok: false, error: "Couldn't clear sample data — try again." };
  }
}
