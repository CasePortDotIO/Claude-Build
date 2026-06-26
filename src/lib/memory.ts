import { prisma } from "@/lib/prisma";
import { getEmbedder } from "@/lib/ai/embedder";
import type { MemoryKind, Prisma } from "@prisma/client";

/**
 * Semantic memory layer (§4b) over pgvector.
 *
 * IMPORTANT: these helpers use raw SQL, which bypasses the orgScoped() choke
 * point — so `orgId` is a required parameter on every call and is always
 * included in the WHERE clause. Per-org isolation of memory is enforced here.
 */

function toVectorLiteral(vec: number[]): string {
  // pgvector input format: "[0.1,0.2,...]"
  return `[${vec.join(",")}]`;
}

export interface StoreMemoryInput {
  orgId: string;
  kind: MemoryKind;
  content: string;
  leadId?: string | null;
  sourceId?: string | null;
  metadata?: Prisma.InputJsonValue;
}

/** Embed `content` and persist it as an org-scoped memory chunk. Returns the id. */
export async function storeMemory(input: StoreMemoryInput): Promise<string> {
  const [embedding] = await getEmbedder().embed([input.content]);

  // Create the row without the vector (Prisma can't write the Unsupported
  // column), then set the embedding via raw SQL.
  const row = await prisma.memoryEmbedding.create({
    data: {
      orgId: input.orgId,
      kind: input.kind,
      content: input.content,
      leadId: input.leadId ?? undefined,
      sourceId: input.sourceId ?? undefined,
      metadata: input.metadata,
    },
    select: { id: true },
  });

  await prisma.$executeRawUnsafe(
    `UPDATE "MemoryEmbedding" SET "embedding" = $1::vector WHERE "id" = $2`,
    toVectorLiteral(embedding),
    row.id,
  );
  return row.id;
}

/** Batch variant — embeds all contents in one provider call, then stores them. */
export async function storeMemoryBatch(inputs: StoreMemoryInput[]): Promise<string[]> {
  if (inputs.length === 0) return [];
  const embeddings = await getEmbedder().embed(inputs.map((i) => i.content));
  const ids: string[] = [];
  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i];
    const row = await prisma.memoryEmbedding.create({
      data: {
        orgId: input.orgId,
        kind: input.kind,
        content: input.content,
        leadId: input.leadId ?? undefined,
        sourceId: input.sourceId ?? undefined,
        metadata: input.metadata,
      },
      select: { id: true },
    });
    await prisma.$executeRawUnsafe(
      `UPDATE "MemoryEmbedding" SET "embedding" = $1::vector WHERE "id" = $2`,
      toVectorLiteral(embeddings[i]),
      row.id,
    );
    ids.push(row.id);
  }
  return ids;
}

export interface RetrievedMemory {
  id: string;
  kind: MemoryKind;
  content: string;
  leadId: string | null;
  similarity: number; // cosine similarity in [-1, 1] (1 = identical)
}

export interface RetrieveOptions {
  orgId: string; // REQUIRED — isolation boundary
  query: string;
  k?: number;
  kinds?: MemoryKind[]; // restrict to these memory kinds
  leadId?: string | null; // restrict to one lead's memory
}

/**
 * Retrieve the top-k most semantically similar memory chunks for an org.
 * Ordered by cosine distance (`<=>`); similarity = 1 - distance.
 */
export async function retrieveSimilar(opts: RetrieveOptions): Promise<RetrievedMemory[]> {
  const { orgId, query, k = 5, kinds, leadId } = opts;
  const [qvec] = await getEmbedder().embed([query]);

  // Build a positional-parameter query. $1 = vector, $2 = orgId, then filters.
  const params: unknown[] = [toVectorLiteral(qvec), orgId];
  let sql = `
    SELECT "id", "kind", "content", "leadId",
           1 - ("embedding" <=> $1::vector) AS similarity
    FROM "MemoryEmbedding"
    WHERE "orgId" = $2 AND "embedding" IS NOT NULL`;

  if (kinds && kinds.length > 0) {
    // Cast text params to the enum type so the IN comparison type-checks.
    const placeholders = kinds.map((_, i) => `$${params.length + i + 1}::"MemoryKind"`).join(",");
    sql += ` AND "kind" IN (${placeholders})`;
    params.push(...kinds);
  }
  if (leadId) {
    params.push(leadId);
    sql += ` AND "leadId" = $${params.length}`;
  }

  params.push(k);
  sql += ` ORDER BY "embedding" <=> $1::vector LIMIT $${params.length}`;

  const rows = await prisma.$queryRawUnsafe<
    { id: string; kind: MemoryKind; content: string; leadId: string | null; similarity: number }[]
  >(sql, ...params);

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    content: r.content,
    leadId: r.leadId,
    similarity: Number(r.similarity),
  }));
}
