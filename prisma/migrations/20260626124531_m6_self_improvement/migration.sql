-- CreateEnum
CREATE TYPE "Cohort" AS ENUM ('TREATMENT', 'HOLDOUT');

-- CreateEnum
CREATE TYPE "InsightKind" AS ENUM ('PROMOTE_OPENER', 'RETIRE_PHRASE', 'SHIFT_SENDTIME', 'TIGHTEN_FOLLOWUP', 'AB_RESULT');

-- CreateEnum
CREATE TYPE "InsightStatus" AS ENUM ('PROPOSED', 'APPLIED', 'VETOED');

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "cohort" "Cohort" NOT NULL DEFAULT 'TREATMENT';

-- CreateTable
CREATE TABLE "Insight" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "kind" "InsightKind" NOT NULL,
    "status" "InsightStatus" NOT NULL DEFAULT 'PROPOSED',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "payload" JSONB,
    "appliedById" TEXT,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Insight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgLearning" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "bestSendHour" INTEGER,
    "retiredPhrases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "promotedOpeners" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "followUpGapDays" INTEGER NOT NULL DEFAULT 3,
    "lastReflectionAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgLearning_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Insight_orgId_status_idx" ON "Insight"("orgId", "status");

-- CreateIndex
CREATE INDEX "Insight_orgId_createdAt_idx" ON "Insight"("orgId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrgLearning_orgId_key" ON "OrgLearning"("orgId");

-- AddForeignKey
ALTER TABLE "Insight" ADD CONSTRAINT "Insight_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgLearning" ADD CONSTRAINT "OrgLearning_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;
