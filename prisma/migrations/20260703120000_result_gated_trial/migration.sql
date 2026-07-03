-- Result-gated $0 trial: "pay nothing until it books N calls."
ALTER TABLE "Org" ADD COLUMN "trialStartedAt" TIMESTAMP(3);
ALTER TABLE "Org" ADD COLUMN "trialCallThreshold" INTEGER;
ALTER TABLE "Org" ADD COLUMN "trialConvertedAt" TIMESTAMP(3);

-- The "your plan just paid for itself" moment when the trial converts to paid.
ALTER TYPE "NotificationKind" ADD VALUE IF NOT EXISTS 'TRIAL_CONVERTED';
