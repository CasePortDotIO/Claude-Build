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

export async function callToolUse<T>(opts: {
  model: string;
  system: string;
  userContent: string;
  // The tool definition; tool_choice forces the model to call it.
  tool: { name: string; description: string; input_schema: unknown };
  maxTokens?: number;
}): Promise<AnthropicToolCallResult<T>> {
  const cfg = await getAiConfig();
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": cfg.anthropic.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 1500,
      system: opts.system,
      tools: [opts.tool],
      tool_choice: { type: "tool", name: opts.tool.name },
      messages: [{ role: "user", content: opts.userContent }],
    }),
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
