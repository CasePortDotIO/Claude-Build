-- Auto-send mode: auto-approve + send high-confidence drafts (the queue is
-- skipped for confident drafts; low-confidence ones still wait for review).
-- Default false → no behavior change for existing orgs until they opt in.
ALTER TABLE "Org" ADD COLUMN "autopilotApprove" BOOLEAN NOT NULL DEFAULT false;
