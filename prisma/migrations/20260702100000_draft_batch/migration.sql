-- CreateTable
CREATE TABLE "DraftBatch" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "providerBatchId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "leadIds" TEXT[],
    "operatorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DraftBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DraftBatch_providerBatchId_key" ON "DraftBatch"("providerBatchId");
CREATE INDEX "DraftBatch_status_idx" ON "DraftBatch"("status");
CREATE INDEX "DraftBatch_orgId_idx" ON "DraftBatch"("orgId");

-- AddForeignKey
ALTER TABLE "DraftBatch" ADD CONSTRAINT "DraftBatch_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;
