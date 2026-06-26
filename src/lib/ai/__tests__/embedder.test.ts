import { describe, it, expect } from "vitest";
import { HashEmbedder } from "@/lib/ai/embedder";
import { EMBED_DIM } from "@/lib/ai/config";

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // both are L2-normalized → dot product is cosine similarity
}

describe("HashEmbedder", () => {
  const e = new HashEmbedder();

  it("is deterministic and correctly dimensioned + normalized", async () => {
    const [a] = await e.embed(["pricing your coaching packages"]);
    const [b] = await e.embed(["pricing your coaching packages"]);
    expect(a).toHaveLength(EMBED_DIM);
    expect(a).toEqual(b); // deterministic
    expect(cosine(a, a)).toBeCloseTo(1, 5); // unit length
  });

  it("ranks semantically closer text higher (overlap → similarity)", async () => {
    const [query] = await e.embed(["help me with pricing my coaching packages"]);
    const [near] = await e.embed(["pricing coaching packages and rates"]);
    const [far] = await e.embed(["the weather is cold and rainy today"]);
    expect(cosine(query, near)).toBeGreaterThan(cosine(query, far));
  });

  it("gives near-zero similarity to fully disjoint vocabularies", async () => {
    const [a] = await e.embed(["alpha bravo charlie delta"]);
    const [b] = await e.embed(["xylophone quokka zeppelin"]);
    expect(cosine(a, b)).toBeLessThan(0.2);
  });
});
