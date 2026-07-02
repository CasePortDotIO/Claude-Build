// Central place to read AI config + decide which providers are live.
//
// The whole engine runs with OR without API keys: when keys are present we use
// Anthropic (reasoning/copy) + Voyage (embeddings); when absent we fall back to
// deterministic local providers so the app stays fully demoable and testable.
// Keys resolve from the in-app encrypted store first, then env (lib/config/
// secrets) — so an admin can connect AI in a few clicks without a redeploy.
// Secrets are read here, server-side only — never exported to the client.

import { getSecret } from "@/lib/config/secrets";

export const EMBED_DIM = 1024; // voyage-3 output dimension

export interface AiConfig {
  anthropic: { apiKey: string; model: string; fastModel: string };
  voyage: { apiKey: string; model: string };
}

/** Resolve AI config (in-app store first, then env). Async — reads getSecret. */
export async function getAiConfig(): Promise<AiConfig> {
  const [aKey, aModel, aFast, vKey, vModel] = await Promise.all([
    getSecret("ANTHROPIC_API_KEY"),
    getSecret("ANTHROPIC_MODEL"),
    getSecret("ANTHROPIC_MODEL_FAST"),
    getSecret("VOYAGE_API_KEY"),
    getSecret("VOYAGE_MODEL"),
  ]);
  return {
    anthropic: {
      apiKey: aKey ?? "",
      // Sonnet is the drafting default: re-engagement copy doesn't need Opus,
      // and Sonnet is ~5x cheaper per token. fastModel serves bulk/cron tiers.
      model: aModel || "claude-sonnet-5",
      fastModel: aFast || "claude-haiku-4-5-20251001",
    },
    voyage: { apiKey: vKey ?? "", model: vModel || "voyage-3" },
  };
}

export async function hasAnthropic(): Promise<boolean> {
  return Boolean(await getSecret("ANTHROPIC_API_KEY"));
}

export async function hasVoyage(): Promise<boolean> {
  return Boolean(await getSecret("VOYAGE_API_KEY"));
}

// Indicative Anthropic pricing (USD per 1M tokens) for cost logging in
// agent_runs. Kept here so it's easy to update; approximate, not billing-grade.
export const MODEL_PRICING: Record<string, { inPerM: number; outPerM: number }> = {
  "claude-opus-4-8": { inPerM: 15, outPerM: 75 },
  "claude-sonnet-5": { inPerM: 3, outPerM: 15 },
  "claude-sonnet-4-6": { inPerM: 3, outPerM: 15 },
  "claude-haiku-4-5-20251001": { inPerM: 1, outPerM: 5 },
};

export function estimateCostUsd(model: string, promptTokens: number, completionTokens: number): number {
  const p = MODEL_PRICING[model] ?? { inPerM: 0, outPerM: 0 };
  return (promptTokens / 1_000_000) * p.inPerM + (completionTokens / 1_000_000) * p.outPerM;
}
