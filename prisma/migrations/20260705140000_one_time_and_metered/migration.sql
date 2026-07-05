-- One-time purchases ($27 Founding + $17 bump, $197 Own-It) and metered
-- per-booked-call billing ($97 Performance). One-time tiers carry a TOTAL lead
-- quota; the metered plan reports usage against a Stripe subscription item.

ALTER TABLE "Org" ADD COLUMN "oneTimeLeadQuota" INTEGER;
ALTER TABLE "Org" ADD COLUMN "meteredSubscriptionItemId" TEXT;
