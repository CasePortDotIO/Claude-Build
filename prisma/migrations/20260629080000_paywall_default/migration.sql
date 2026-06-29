-- Paid-only launch: new workspaces start unpaid and must subscribe to use the app.
-- Existing orgs keep their current billingStatus (grandfathered).
ALTER TABLE "Org" ALTER COLUMN "billingStatus" SET DEFAULT 'incomplete';
