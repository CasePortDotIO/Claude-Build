import { getAiConfig } from "@/lib/ai/config";

/**
 * Minimal server-side client for the Anthropic Messages API with forced tool
 * use. We hand-roll fetch (no SDK dependency) and return the parsed tool input
 * plus usage. Requests to api.anthropic.com go direct (no proxy). The API key
 * is read server-side only and never leaves this module.
 */

export interface AnthropicToolCallResult<T> {
  input: T;
  usage: { promptTokens: number; completionTokens: number };
}

interface MessagesResponse {
  content: { type: string; name?: string; input?: unknown }[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

export interface ToolUseRequest {
  model: string;
  system: string;
  userContent: string;
  // The tool definition; tool_choice forces the model to call it.
  tool: { name: string; description: string; input_schema: unknown };
  maxTokens?: number;
}

// One place builds the Messages payload so realtime and batched requests can
// never drift apart. Prompt caching: the system prompt (voice profile +
// doctrine) and tool schema are identical across every lead in a run, so the
// cacheable prefix bills at ~10% after the first call. Ignored harmlessly if
// the prefix is under the model's cacheable minimum.
function buildToolUseParams(opts: ToolUseRequest) {
  return {
    model: opts.model,
    max_tokens: opts.maxTokens ?? 1500,
    system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
    tools: [opts.tool],
    tool_choice: { type: "tool", name: opts.tool.name },
    messages: [{ role: "user", content: opts.userContent }],
  };
}

async function anthropicHeaders(): Promise<Record<string, string>> {
  const cfg = await getAiConfig();
  return {
    "content-type": "application/json",
    "x-api-key": cfg.anthropic.apiKey,
    "anthropic-version": "2023-06-01",
  };
}

export async function callToolUse<T>(opts: ToolUseRequest): Promise<AnthropicToolCallResult<T>> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: await anthropicHeaders(),
    body: JSON.stringify(buildToolUseParams(opts)),
  });

  if (!res.ok) {
    throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
  }

  const json = (await res.json()) as MessagesResponse;
  const toolBlock = json.content?.find((c) => c.type === "tool_use" && c.name === opts.tool.name);
  if (!toolBlock?.input) {
    throw new Error("Anthropic response did not include the expected tool call");
  }

  return {
    input: toolBlock.input as T,
    usage: {
      promptTokens: json.usage?.input_tokens ?? 0,
      completionTokens: json.usage?.output_tokens ?? 0,
    },
  };
}

// ── Message Batches (50% token discount for async bulk work) ─────────────────
// The autopilot cron submits a batch of draft requests, then a later cron pass
// collects the results. Same payload builder as realtime, so the prompts and
// caching behavior are identical — only the billing and latency differ.

/** Submit a batch of forced-tool-use requests. Returns the provider batch id. */
export async function submitToolUseBatch(
  requests: { customId: string; params: ToolUseRequest }[],
): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages/batches", {
    method: "POST",
    headers: await anthropicHeaders(),
    body: JSON.stringify({
      requests: requests.map((r) => ({ custom_id: r.customId, params: buildToolUseParams(r.params) })),
    }),
  });
  if (!res.ok) {
    throw new Error(`Anthropic batch create ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as { id: string };
  return json.id;
}

export type BatchItemResult =
  | { customId: string; ok: true; input: unknown; usage: { promptTokens: number; completionTokens: number }; model: string }
  | { customId: string; ok: false; error: string };

/**
 * Check a batch; when it has ended, fetch and parse the JSONL results. Items
 * that errored/expired come back as ok:false so the caller can count them
 * without one bad item hiding the rest.
 */
export async function fetchToolUseBatch(
  batchId: string,
): Promise<{ done: false } | { done: true; items: BatchItemResult[] }> {
  const headers = await anthropicHeaders();
  const res = await fetch(`https://api.anthropic.com/v1/messages/batches/${batchId}`, { headers });
  if (!res.ok) {
    throw new Error(`Anthropic batch status ${res.status}: ${await res.text()}`);
  }
  const meta = (await res.json()) as { processing_status: string; results_url?: string | null };
  if (meta.processing_status !== "ended" || !meta.results_url) return { done: false };

  const rres = await fetch(meta.results_url, { headers });
  if (!rres.ok) {
    throw new Error(`Anthropic batch results ${rres.status}: ${await rres.text()}`);
  }
  const items: BatchItemResult[] = [];
  for (const line of (await rres.text()).split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let row: {
      custom_id: string;
      result?: { type?: string; message?: MessagesResponse & { model?: string }; error?: { message?: string } };
    };
    try {
      row = JSON.parse(trimmed);
    } catch {
      continue;
    }
    const msg = row.result?.type === "succeeded" ? row.result.message : undefined;
    const toolBlock = msg?.content?.find((c) => c.type === "tool_use");
    if (msg && toolBlock?.input) {
      items.push({
        customId: row.custom_id,
        ok: true,
        input: toolBlock.input,
        usage: {
          promptTokens: msg.usage?.input_tokens ?? 0,
          completionTokens: msg.usage?.output_tokens ?? 0,
        },
        model: msg.model ?? "",
      });
    } else {
      items.push({
        customId: row.custom_id,
        ok: false,
        error: row.result?.error?.message ?? row.result?.type ?? "malformed batch result",
      });
    }
  }
  return { done: true, items };
}
