-- Enable pgvector for semantic memory (idempotent).
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "MemoryKind" AS ENUM ('VOICE_SAMPLE', 'LEAD_REPLY', 'OBJECTION', 'INQUIRY');

-- CreateEnum
CREATE TYPE "DraftStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "AgentStep" AS ENUM ('RESEARCH', 'DRAFT', 'REPLY', 'REFLECT', 'VOICE_LEARN');

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "objections" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "VoiceProfile" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "tone" TEXT NOT NULL DEFAULT 'Warm, direct, no fluff',
    "sentenceLength" TEXT NOT NULL DEFAULT 'Short. Punchy.',
    "emojiUse" TEXT NOT NULL DEFAULT 'Rare, never salesy',
    "greeting" TEXT NOT NULL DEFAULT 'Hi {{firstName}},',
    "signOff" TEXT NOT NULL DEFAULT '— {{operator}}',
    "signatureMove" TEXT NOT NULL DEFAULT 'Ask, don''t pitch',
    "summary" TEXT,
    "doRules" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dontRules" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sampleCount" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'default',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoiceProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoiceSample" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoiceSample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemoryEmbedding" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "kind" "MemoryKind" NOT NULL,
    "leadId" TEXT,
    "sourceId" TEXT,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "embedding" vector(1024),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemoryEmbedding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Draft" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "status" "DraftStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "selectedVariantId" TEXT,
    "finalSubject" TEXT,
    "finalBody" TEXT,
    "editedByHuman" BOOLEAN NOT NULL DEFAULT false,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedReason" TEXT,
    "agentRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Draft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DraftVariant" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "angle" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "openingLine" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rationale" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DraftVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "leadId" TEXT,
    "step" "AgentStep" NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputSummary" TEXT NOT NULL,
    "decision" JSONB,
    "rationale" TEXT,
    "confidence" DOUBLE PRECISION,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'OK',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VoiceProfile_orgId_key" ON "VoiceProfile"("orgId");

-- CreateIndex
CREATE INDEX "VoiceSample_orgId_idx" ON "VoiceSample"("orgId");

-- CreateIndex
CREATE INDEX "MemoryEmbedding_orgId_kind_idx" ON "MemoryEmbedding"("orgId", "kind");

-- CreateIndex
CREATE INDEX "MemoryEmbedding_leadId_idx" ON "MemoryEmbedding"("leadId");

-- CreateIndex
CREATE INDEX "Draft_orgId_status_idx" ON "Draft"("orgId", "status");

-- CreateIndex
CREATE INDEX "Draft_leadId_idx" ON "Draft"("leadId");

-- CreateIndex
CREATE INDEX "DraftVariant_draftId_idx" ON "DraftVariant"("draftId");

-- CreateIndex
CREATE INDEX "AgentRun_orgId_createdAt_idx" ON "AgentRun"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentRun_leadId_idx" ON "AgentRun"("leadId");

-- AddForeignKey
ALTER TABLE "VoiceProfile" ADD CONSTRAINT "VoiceProfile_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceSample" ADD CONSTRAINT "VoiceSample_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryEmbedding" ADD CONSTRAINT "MemoryEmbedding_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryEmbedding" ADD CONSTRAINT "MemoryEmbedding_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftVariant" ADD CONSTRAINT "DraftVariant_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- HNSW index for cosine-distance similarity search (pgvector >= 0.5).
-- Speeds up ORDER BY embedding <=> query in lib/memory retrieval.
CREATE INDEX IF NOT EXISTS "MemoryEmbedding_embedding_cos_idx"
  ON "MemoryEmbedding" USING hnsw ("embedding" vector_cosine_ops);
