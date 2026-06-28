-- M17: autopilot (always-on) opt-in flags. Default false → no behavior change
-- for existing orgs; the autopilot job only touches orgs that opt in.
ALTER TABLE "Org" ADD COLUMN "autopilotSync" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Org" ADD COLUMN "autopilotDraft" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Org" ADD COLUMN "autopilotSend" BOOLEAN NOT NULL DEFAULT false;
