-- Entitlements / margin governance: per-tier plan + fresh-lead draft meter.
ALTER TABLE "Org" ADD COLUMN "planTier" TEXT;
ALTER TABLE "Org" ADD COLUMN "leadsDraftedThisPeriod" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Org" ADD COLUMN "meterPeriodStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
