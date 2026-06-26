-- CreateEnum
CREATE TYPE "LeadSourceKind" AS ENUM ('CSV', 'HUBSPOT', 'GOOGLE_SHEETS', 'MAILCHIMP', 'KAJABI');

-- CreateEnum
CREATE TYPE "LeadSourceStatus" AS ENUM ('CONNECTED', 'DISCONNECTED');

-- CreateTable
CREATE TABLE "LeadSourceConnection" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "provider" "LeadSourceKind" NOT NULL,
    "status" "LeadSourceStatus" NOT NULL DEFAULT 'CONNECTED',
    "apiKeyEnc" TEXT,
    "config" JSONB,
    "lastSyncAt" TIMESTAMP(3),
    "lastImported" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadSourceConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadSourceConnection_orgId_idx" ON "LeadSourceConnection"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "LeadSourceConnection_orgId_provider_key" ON "LeadSourceConnection"("orgId", "provider");

-- AddForeignKey
ALTER TABLE "LeadSourceConnection" ADD CONSTRAINT "LeadSourceConnection_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;
