import { prisma } from "@/lib/prisma";
import { encryptSecret, decryptSecret } from "@/lib/crypto";

/**
 * Integration credentials resolved from the in-app store (AppConfig, encrypted)
 * with a fallback to the matching environment variable. This is what lets an
 * admin connect Stripe / email / etc. in a few clicks instead of editing env and
 * redeploying. A short TTL cache keeps hot paths (send, checkout) from hitting
 * the DB on every call; writes bust it immediately within the instance.
 */
export const SECRET_KEYS = [
  "STRIPE_SECRET_KEY",
  "STRIPE_PRICE_ID",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PLAN_NAME",
  "STRIPE_PLAN_PRICE_LABEL",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "MICROSOFT_CLIENT_ID",
  "MICROSOFT_CLIENT_SECRET",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_MODEL",
  "ANTHROPIC_MODEL_FAST",
  "VOYAGE_API_KEY",
  "VOYAGE_MODEL",
] as const;
export type SecretKey = (typeof SECRET_KEYS)[number];

const TTL_MS = 30_000;
let cache: { at: number; map: Record<string, string> } | null = null;

async function loadDbConfig(): Promise<Record<string, string>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.map;
  const map: Record<string, string> = {};
  try {
    const rows = await prisma.appConfig.findMany();
    for (const r of rows) {
      try { map[r.key] = decryptSecret(r.valueEnc); } catch { /* skip undecryptable */ }
    }
    cache = { at: Date.now(), map };
  } catch {
    // DB hiccup → fall back to env only; don't cache the empty result.
    return cache?.map ?? {};
  }
  return map;
}

/** Resolve a secret: in-app value (DB) first, then the env var. */
export async function getSecret(key: SecretKey | string): Promise<string | undefined> {
  const db = await loadDbConfig();
  return db[key] || process.env[key] || undefined;
}

/** Save (or clear, when value is empty) an in-app secret. Encrypted at rest. */
export async function setSecret(key: SecretKey, value: string): Promise<void> {
  const v = value.trim();
  if (!v) {
    await prisma.appConfig.deleteMany({ where: { key } });
  } else {
    await prisma.appConfig.upsert({
      where: { key },
      create: { key, valueEnc: encryptSecret(v) },
      update: { valueEnc: encryptSecret(v) },
    });
  }
  cache = null; // bust
}

/**
 * Which keys currently resolve to a value (DB or env), and whether the value
 * comes from the in-app store — for the Integrations UI. Never returns the
 * secret values themselves.
 */
export async function configuredStatus(keys: readonly string[]): Promise<Record<string, { set: boolean; source: "app" | "env" | null }>> {
  const db = await loadDbConfig();
  const out: Record<string, { set: boolean; source: "app" | "env" | null }> = {};
  for (const k of keys) {
    if (db[k]) out[k] = { set: true, source: "app" };
    else if (process.env[k]) out[k] = { set: true, source: "env" };
    else out[k] = { set: false, source: null };
  }
  return out;
}
