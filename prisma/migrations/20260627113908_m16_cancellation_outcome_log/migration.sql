-- CreateEnum
CREATE TYPE "OutcomeKind" AS ENUM ('SENT', 'REPLIED', 'QUALIFIED', 'BOOKED', 'SHOWED', 'NO_SHOW', 'OPTED_OUT');

-- AlterTable
ALTER TABLE "Org" ADD COLUMN     "canceledAt" TIMESTAMP(3),
ADD COLUMN     "vertical" TEXT;

-- CreateTable
CREATE TABLE "OutcomeEvent" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "leadId" TEXT,
    "kind" "OutcomeKind" NOT NULL,
    "subject" TEXT,
    "variantAngle" TEXT,
    "sendHour" INTEGER,
    "vertical" TEXT,
    "valueCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutcomeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OutcomeEvent_orgId_kind_idx" ON "OutcomeEvent"("orgId", "kind");

-- CreateIndex
CREATE INDEX "OutcomeEvent_vertical_kind_idx" ON "OutcomeEvent"("vertical", "kind");

-- AddForeignKey
ALTER TABLE "OutcomeEvent" ADD CONSTRAINT "OutcomeEvent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;
