import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { runReflection } from "@/lib/agent/reflection";
import { reengagementSweep } from "@/lib/agent/maintenance";

/**
 * Nightly reflection job (§8). In production this is invoked on a schedule —
 * e.g. an Inngest cron or a Vercel Cron hitting this route — with a shared
 * secret. It runs the reflection pass for every client org. Proposals land as
 * PROPOSED insights for operator review; nothing auto-applies.
 *
 *   Vercel cron example (vercel.json):
 *     { "crons": [{ "path": "/api/jobs/reflection", "schedule": "0 7 * * *" }] }
 *   with CRON_SECRET set and sent as Authorization: Bearer <secret>.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const orgs = await prisma.org.findMany({ where: { type: "CLIENT" }, select: { id: true } });
  let totalInsights = 0;
  let totalCooled = 0;
  for (const org of orgs) {
    const res = await runReflection(org.id);
    totalInsights += res.created;
    // Follow-up branch: cool leads that went silent past the learned gap.
    const sweep = await reengagementSweep(org.id);
    totalCooled += sweep.cooled;
  }
  return NextResponse.json({ ok: true, orgs: orgs.length, insights: totalInsights, cooled: totalCooled });
}
