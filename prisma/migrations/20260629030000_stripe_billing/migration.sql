-- Stripe billing: customer/subscription linkage on Org. billingStatus (existing)
-- mirrors the Stripe subscription state. Default NULLs → no behavior change.
ALTER TABLE "Org" ADD COLUMN "stripeCustomerId" TEXT;
ALTER TABLE "Org" ADD COLUMN "stripeSubscriptionId" TEXT;
ALTER TABLE "Org" ADD COLUMN "stripePriceId" TEXT;
ALTER TABLE "Org" ADD COLUMN "currentPeriodEnd" TIMESTAMP(3);

CREATE UNIQUE INDEX "Org_stripeCustomerId_key" ON "Org"("stripeCustomerId");
