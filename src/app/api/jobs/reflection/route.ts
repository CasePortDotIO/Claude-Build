import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma, withDbRetry } from "@/lib/prisma";
import { runReflection } from "@/lib/agent/reflection";
import { reengagementSweep, reverifyStale } from "@/lib/agent/maintenance";
import { dailyBrief } from "@/lib/retention";
import { engagementStreak } from "@/lib/streak";
import { notifyMorningBrief } from "@/lib/notify";
import { emailMorningBrief } from "@/lib/agent/digest";
import { reportError } from "@/lib/observability/report";

/**
 * Nightly reflection job (§8). In production this is invoked on a schedule —
 * e.g. an Inngest cron or a Vercel Cron hitting this route — with a shared
 * secret. It runs the reflection pass for every client org. Proposals land as
 * PROPOSED insights for operator review; nothing auto-applies.
 *
 *   Vercel cron example (vercel.json):
 *     { "crons": [{ "path": "/api/jobs/reflection", "schedule": "0 7 * * *" }] }
 *   Vercel Cron invokes the path with GET and auto-attaches
 *   Authorization: Bearer <CRON_SECRET> when CRON_SECRET is set in the project,
 *   so both verbs are handled. External schedulers can POST with the same header.
 */
async function runJob(req: NextRequest) {
  // Fail CLOSED: an unset secret must lock this endpoint, not open it.
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // withDbRetry: tolerate a cold Neon compute on the cron's first query.
  const orgs = await withDbRetry(() => prisma.org.findMany({ where: { type: "CLIENT" }, select: { id: true } }));
  let totalInsights = 0;
  let totalCooled = 0;
  let briefsPushed = 0;
  let briefsEmailed = 0;
  for (const org of orgs) {
    try {
      const res = await runReflection(org.id);
      totalInsights += res.created;
      // Follow-up branch: cool leads that went silent past the learned gap.
      const sweep = await reengagementSweep(org.id);
      totalCooled += sweep.cooled;
      // §3: re-verify contacts that have sat unsent >30 days (data decays).
      await reverifyStale(org.id);
      // M10: the overnight Morning Brief — the habit-loop trigger, on every channel.
      const brief = await dailyBrief(org.id);
      const streak = await engagementStreak(org.id);
      const slack = await notifyMorningBrief(org.id, brief, streak.current);
      if (slack.slack) briefsPushed++;
      const email = await emailMorningBrief(org.id, brief, streak.current);
      briefsEmailed += email.emailed;
    } catch (e) {
      // One org's failure is reported and skipped — never aborts the whole run.
      reportError(e, { job: "reflection", orgId: org.id });
    }
  }
  return NextResponse.json({ ok: true, orgs: orgs.length, insights: totalInsights, cooled: totalCooled, briefsPushed, briefsEmailed });
}

// Vercel Cron uses GET; external schedulers may POST. Both require the secret.
export const GET = runJob;
export const POST = runJob;
