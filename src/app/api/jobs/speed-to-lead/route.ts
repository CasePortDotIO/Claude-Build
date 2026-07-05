import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma, withDbRetry } from "@/lib/prisma";
import { runSpeedToLeadForOrg } from "@/lib/agent/speed-to-lead";
import { reportError } from "@/lib/observability/report";

/**
 * Speed-to-Lead job — the ≤5-minute new-lead follow-up (Performance / Always-On).
 * Runs every few minutes so a fresh lead is contacted minutes after it lands, not
 * on the next 4-hour autopilot pass. Only touches CLIENT orgs that opted into
 * auto-drafting; runSpeedToLeadForOrg then checks the tier entitlement. Same
 * CRON_SECRET Bearer auth as the other jobs.
 *
 *   vercel.json: { "path": "/api/jobs/speed-to-lead", "schedule": "*\/3 * * * *" }
 */
async function runJob(req: NextRequest) {
  // Fail CLOSED: this fans out LLM spend + outbound email, so an unset secret
  // must lock it, not open it. Vercel Cron attaches the Bearer.
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // Only orgs that auto-draft are candidates; the entitlement check is per-org.
  const orgs = await withDbRetry(() =>
    prisma.org.findMany({ where: { type: "CLIENT", autopilotDraft: true }, select: { id: true } }),
  );

  let drafted = 0;
  let sent = 0;
  let eligible = 0;
  for (const org of orgs) {
    try {
      const r = await runSpeedToLeadForOrg(org.id);
      if (r.eligible) eligible += 1;
      drafted += r.drafted;
      sent += r.sent;
    } catch (e) {
      // One org's failure is reported and skipped — never aborts the whole run.
      reportError(e, { job: "speed-to-lead", orgId: org.id });
    }
  }

  return NextResponse.json({ ok: true, orgs: orgs.length, eligible, drafted, sent });
}

export const GET = runJob;
export const POST = runJob;
// Fans out LLM drafting + sending across orgs; give it headroom.
export const maxDuration = 300;
