import { EMBED_DIM, aiConfig, hasVoyage } from "@/lib/ai/config";

/**
 * Embedder abstraction (§2/§4). Reasoning/copy uses Claude; embeddings use
 * Voyage (Anthropic has no embeddings endpoint). Both implementations return
 * L2-normalized vectors of length EMBED_DIM so cosine similarity == dot product.
 */
export interface Embedder {
  readonly name: string;
  embed(texts: string[]): Promise<number[][]>;
}

function l2normalize(v: number[]): number[] {
  let sum = 0;
  for (const x of v) sum += x * x;
  const norm = Math.sqrt(sum) || 1;
  return v.map((x) => x / norm);
}

/** Real provider: Voyage AI embeddings. */
class VoyageEmbedder implements Embedder {
  readonly name = "voyage";
  async embed(texts: string[]): Promise<number[][]> {
    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${aiConfig.voyage.apiKey}`,
      },
      body: JSON.stringify({ input: texts, model: aiConfig.voyage.model }),
    });
    if (!res.ok) {
      throw new Error(`Voyage embeddings failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as { data: { embedding: number[] }[] };
    return json.data.map((d) => l2normalize(d.embedding));
  }
}

/**
 * Deterministic local fallback — a hashed bag-of-words embedding. No network,
 * no key. Crucially, similarity tracks token overlap, so semantic retrieval is
 * *meaningful* (texts that share words rank closer) and unit-testable. Used for
 * dev/test and whenever VOYAGE_API_KEY is unset.
 */
export class HashEmbedder implements Embedder {
  readonly name = "hash-local";
  constructor(private dim = EMBED_DIM) {}

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1);
  }

  // FNV-1a hash → bucket index, with a sign bucket so distinct tokens can cancel.
  private hash(token: string): number {
    let h = 2166136261;
    for (let i = 0; i < token.length; i++) {
      h ^= token.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => {
      const vec = new Array<number>(this.dim).fill(0);
      const tokens = this.tokenize(text);
      for (const tok of tokens) {
        const h = this.hash(tok);
        const idx = h % this.dim;
        const sign = (h >>> 31) & 1 ? -1 : 1;
        vec[idx] += sign;
      }
      return l2normalize(vec);
    });
  }
}

let cached: Embedder | null = null;

/** The active embedder: Voyage if keyed, else the deterministic local one. */
export function getEmbedder(): Embedder {
  if (cached) return cached;
  cached = hasVoyage() ? new VoyageEmbedder() : new HashEmbedder();
  return cached;
}

// Test seam: reset the memoized embedder (used in unit tests).
export function __resetEmbedder() {
  cached = null;
}
