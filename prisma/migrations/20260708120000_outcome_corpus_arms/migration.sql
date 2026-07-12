-- Corpus vector completion: cadence (touch), list-source, and the system-assigned
-- randomized experiment arm — snapshotted on every terminal outcome so the
-- outcome-data corpus is complete and causal (not confounded) from campaign one.

ALTER TABLE "OutcomeEvent" ADD COLUMN "touch" INTEGER;
ALTER TABLE "OutcomeEvent" ADD COLUMN "source" TEXT;
ALTER TABLE "OutcomeEvent" ADD COLUMN "arm" TEXT;

CREATE INDEX "OutcomeEvent_arm_kind_idx" ON "OutcomeEvent"("arm", "kind");
