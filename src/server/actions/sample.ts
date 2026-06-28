"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/auth-helpers";
import { clearSampleData } from "@/lib/sample/seed";
import { withDbRetry } from "@/lib/prisma";

export interface SampleActionResult {
  ok: boolean;
  error?: string;
  message?: string;
}

/** Remove the alive-from-zero sample data once the operator brings their own leads. */
export async function clearSampleDataAction(): Promise<SampleActionResult> {
  const ctx = await requireOrg();
  try {
    const removed = await withDbRetry(() => clearSampleData(ctx.orgId));
    // The sample data touches every screen — refresh them all.
    for (const p of ["/", "/leads", "/approvals", "/conversations", "/connections"]) revalidatePath(p);
    return { ok: true, message: removed > 0 ? "Sample data cleared." : "No sample data to clear." };
  } catch (err) {
    console.error("clearSampleData failed:", err);
    return { ok: false, error: "Couldn't clear sample data — try again." };
  }
}
