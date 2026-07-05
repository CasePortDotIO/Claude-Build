-- Onboarding intake (p8): the buyer's ideal-client description + the intake
-- submission time that anchors the activation SLAs (build 48h / outreach 72h /
-- dashboard activity 5–7 days) shown on the build tracker.

ALTER TABLE "Org" ADD COLUMN "idealClient" TEXT;
ALTER TABLE "Org" ADD COLUMN "onboardingSubmittedAt" TIMESTAMP(3);
