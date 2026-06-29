"use server";

import { revalidatePath } from "next/cache";
import { requireOrg, assertRole } from "@/lib/auth-helpers";
import { setSecret, SECRET_KEYS, type SecretKey } from "@/lib/config/secrets";

export interface IntegrationsActionResult {
  ok: boolean;
  error?: string;
  message?: string;
}

const ALLOWED = new Set<string>(SECRET_KEYS);

/**
 * Save one integration's credentials in-app (encrypted). Admin-only. An empty
 * value clears that key (falls back to env). Only whitelisted keys are accepted.
 */
export async function saveIntegrationsAction(values: Record<string, string>): Promise<IntegrationsActionResult> {
  const ctx = await requireOrg();
  try {
    assertRole(ctx, "CLIENT_ADMIN");
  } catch {
    return { ok: false, error: "Only an admin can manage integrations." };
  }

  const entries = Object.entries(values).filter(([k]) => ALLOWED.has(k));
  if (entries.length === 0) return { ok: false, error: "Nothing to save." };

  try {
    for (const [k, v] of entries) await setSecret(k as SecretKey, v ?? "");
    revalidatePath("/account");
    revalidatePath("/");
    return { ok: true, message: "Saved." };
  } catch (err) {
    console.error("saveIntegrations failed:", err);
    return { ok: false, error: "Couldn't save — try again." };
  }
}
