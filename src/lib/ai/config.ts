// Central place to read AI config + decide which providers are live.
//
// The whole engine runs with OR without API keys: when keys are present we use
// Anthropic (reasoning/copy) + Voyage (embeddings); when absent we fall back to
// deterministic local providers so the app stays fully demoable and testable.
// Secrets are read here, server-side only — never exported to the client.

export const EMBED_DIM = 1024; // voyage-3 output dimension

export const aiConfig = {
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY ?? "",
    model: process.env.ANTHROPIC_MODEL || "claude-opus-4-8",
    fastModel: process.env.ANTHROPIC_MODEL_FAST || "claude-haiku-4-5-20251001",
  },
  voyage: {
    apiKey: process.env.VOYAGE_API_KEY ?? "",
    model: process.env.VOYAGE_MODEL || "voyage-3",
  },
};

export function hasAnthropic(): boolean {
  return aiConfig.anthropic.apiKey.length > 0;
}

export function hasVoyage(): boolean {
  return aiConfig.voyage.apiKey.length > 0;
}

// Indicative Anthropic pricing (USD per 1M tokens) for cost logging in
// agent_runs. Kept here so it's easy to update; approximate, not billing-grade.
export const MODEL_PRICING: Record<string, { inPerM: number; outPerM: number }> = {
  "claude-opus-4-8": { inPerM: 15, outPerM: 75 },
  "claude-sonnet-4-6": { inPerM: 3, outPerM: 15 },
  "claude-haiku-4-5-20251001": { inPerM: 1, outPerM: 5 },
};

export function estimateCostUsd(model: string, promptTokens: number, completionTokens: number): number {
  const p = MODEL_PRICING[model] ?? { inPerM: 0, outPerM: 0 };
  return (promptTokens / 1_000_000) * p.inPerM + (completionTokens / 1_000_000) * p.outPerM;
}
