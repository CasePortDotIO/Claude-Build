-- Guarantee engine: rolling booked-call windows that settle to MET / MISSED and
-- apply a remedy on a miss ("3 calls in 30 days or keep sweeping free", "under 5
-- calls this month → month free"). The guarantees become a real subsystem.

-- Enums
CREATE TYPE "GuaranteeType" AS ENUM ('THREE_CALL', 'FIVE_CALL_MONTH');
CREATE TYPE "GuaranteeState" AS ENUM ('ACTIVE', 'MET', 'MISSED');
CREATE TYPE "RemedyKind" AS ENUM ('FREE_EXTENSION', 'FREE_MONTH', 'REFUND_DUE');

-- Notification kinds for guarantee settlement.
ALTER TYPE "NotificationKind" ADD VALUE IF NOT EXISTS 'GUARANTEE_MET';
ALTER TYPE "NotificationKind" ADD VALUE IF NOT EXISTS 'GUARANTEE_MISSED';

-- Org remedy state: free-month credits owed + the rate locked for life.
ALTER TABLE "Org" ADD COLUMN "guaranteeCreditMonths" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Org" ADD COLUMN "rateLockedCents" INTEGER;

-- The ledger.
CREATE TABLE "GuaranteeLedger" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "type" "GuaranteeType" NOT NULL,
    "threshold" INTEGER NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "GuaranteeState" NOT NULL DEFAULT 'ACTIVE',
    "bookedCount" INTEGER NOT NULL DEFAULT 0,
    "remedy" "RemedyKind",
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuaranteeLedger_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GuaranteeLedger_orgId_status_idx" ON "GuaranteeLedger"("orgId", "status");
CREATE INDEX "GuaranteeLedger_status_periodEnd_idx" ON "GuaranteeLedger"("status", "periodEnd");

ALTER TABLE "GuaranteeLedger" ADD CONSTRAINT "GuaranteeLedger_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;
