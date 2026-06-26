import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { storeMemoryBatch, retrieveSimilar } from "@/lib/memory";

/**
 * DB-backed test for semantic memory over pgvector. Proves two things:
 *  1. retrieval ranks the most relevant chunk first (real cosine search),
 *  2. memory is per-org isolated — org B never retrieves org A's chunks.
 * Uses the deterministic local embedder (no VOYAGE_API_KEY in tests).
 */
describe("semantic memory (pgvector)", () => {
  const tag = `mem-${Math.random().toString(36).slice(2, 8)}`;
  let orgA: string;
  let orgB: string;

  beforeAll(async () => {
    const a = await prisma.org.create({ data: { name: `A ${tag}`, slug: `a-${tag}`, type: "CLIENT" } });
    const b = await prisma.org.create({ data: { name: `B ${tag}`, slug: `b-${tag}`, type: "CLIENT" } });
    orgA = a.id;
    orgB = b.id;

    await storeMemoryBatch([
      { orgId: orgA, kind: "VOICE_SAMPLE", content: "pricing your coaching packages and rates for clients" },
      { orgId: orgA, kind: "VOICE_SAMPLE", content: "weekly accountability rhythm for a product launch" },
      { orgId: orgA, kind: "OBJECTION", content: "worried it costs too much money right now" },
    ]);
    // Org B has a chunk on the SAME topic as org A's first — isolation must hold.
    await storeMemoryBatch([
      { orgId: orgB, kind: "VOICE_SAMPLE", content: "pricing your coaching packages and rates for clients" },
    ]);
  });

  afterAll(async () => {
    await prisma.memoryEmbedding.deleteMany({ where: { orgId: { in: [orgA, orgB] } } });
    await prisma.org.deleteMany({ where: { id: { in: [orgA, orgB] } } });
    await prisma.$disconnect();
  });

  it("retrieves the most semantically relevant chunk first", async () => {
    const hits = await retrieveSimilar({ orgId: orgA, query: "how should I price my coaching packages?", k: 3 });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].content).toContain("pricing your coaching packages");
    expect(hits[0].similarity).toBeGreaterThan(hits[hits.length - 1].similarity);
  });

  it("filters by memory kind", async () => {
    const hits = await retrieveSimilar({ orgId: orgA, query: "too expensive", k: 5, kinds: ["OBJECTION"] });
    expect(hits.every((h) => h.kind === "OBJECTION")).toBe(true);
    expect(hits[0].content).toContain("costs too much");
  });

  it("is per-org isolated — org B only sees its own memory", async () => {
    const aHits = await retrieveSimilar({ orgId: orgA, query: "pricing packages", k: 10 });
    const bHits = await retrieveSimilar({ orgId: orgB, query: "pricing packages", k: 10 });
    expect(aHits.length).toBe(3);
    expect(bHits.length).toBe(1); // org B has exactly one chunk, never sees A's three
  });
});
