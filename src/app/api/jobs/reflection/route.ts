import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { runReflection } from "@/lib/agent/reflection";
import { reengagementSweep } from "@/lib/agent/maintenance";
import { dailyBrief } from "@/lib/retention";
import { notifyMorningBrief } from "@/lib/notify";

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
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const orgs = await prisma.org.findMany({ where: { type: "CLIENT" }, select: { id: true } });
  let totalInsights = 0;
  let totalCooled = 0;
  let briefsPushed = 0;
  for (const org of orgs) {
    const res = await runReflection(org.id);
    totalInsights += res.created;
    // Follow-up branch: cool leads that went silent past the learned gap.
    const sweep = await reengagementSweep(org.id);
    totalCooled += sweep.cooled;
    // M10: push the overnight Morning Brief to Slack — the habit-loop trigger.
    const brief = await dailyBrief(org.id);
    const sent = await notifyMorningBrief(org.id, brief);
    if (sent.slack) briefsPushed++;
  }
  return NextResponse.json({ ok: true, orgs: orgs.length, insights: totalInsights, cooled: totalCooled, briefsPushed });
}

// Vercel Cron uses GET; external schedulers may POST. Both require the secret.
export const GET = runJob;
export const POST = runJob;
