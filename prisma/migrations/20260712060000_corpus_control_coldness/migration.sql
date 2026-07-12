-- Definitive corpus row: the causal control (isHoldout) + drift-prone lead
-- features frozen at event time (reachability, leadColdnessDays), and the lead's
-- pre-import last-engagement date that anchors coldness.

ALTER TABLE "OutcomeEvent" ADD COLUMN "isHoldout" BOOLEAN;
ALTER TABLE "OutcomeEvent" ADD COLUMN "reachability" TEXT;
ALTER TABLE "OutcomeEvent" ADD COLUMN "leadColdnessDays" INTEGER;

ALTER TABLE "Lead" ADD COLUMN "lastEngagedAt" TIMESTAMP(3);
