import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { runAutopilotForOrg } from "@/lib/agent/autopilot";

/**
 * M17 autopilot — the always-on job. Runs every few hours so fresh leads get
 * synced + drafted and approved drafts go out within hours, not whenever the
 * operator next logs in. Only touches CLIENT orgs that opted into at least one
 * autopilot capability, so it's a no-op for everyone else. Same CRON_SECRET
 * Bearer auth as the other jobs; Vercel Cron invokes with GET.
 *
 *   vercel.json: { "path": "/api/jobs/autopilot", "schedule": "0 *\/4 * * *" }
 */
async function runJob(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const orgs = await prisma.org.findMany({
    where: { type: "CLIENT", OR: [{ autopilotSync: true }, { autopilotDraft: true }, { autopilotSend: true }, { autopilotApprove: true }] },
    select: { id: true },
  });

  let synced = 0;
  let drafted = 0;
  let sent = 0;
  for (const org of orgs) {
    const r = await runAutopilotForOrg(org.id);
    synced += r.synced;
    drafted += r.drafted;
    sent += r.sent;
  }

  return NextResponse.json({ ok: true, orgs: orgs.length, synced, drafted, sent });
}

export const GET = runJob;
export const POST = runJob;
// Autopilot fans out across orgs and runs LLM drafting; give it headroom.
export const maxDuration = 300;
