import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendDueReminders, sweepNoShows } from "@/lib/agent/reminders";

/**
 * §6 no-show defense — the hourly job. Reminders (24h + 1h before a call) need a
 * sub-daily cadence the daily reflection job can't give, so they live here.
 * Lightweight: only fires due reminders and reconciles stale past calls to
 * NO_SHOW. Same CRON_SECRET Bearer auth; Vercel Cron invokes with GET.
 *
 *   vercel.json: { "path": "/api/jobs/reminders", "schedule": "0 * * * *" }
 */
async function runJob(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const orgs = await prisma.org.findMany({ where: { type: "CLIENT" }, select: { id: true } });
  let reminded = 0;
  let noShows = 0;
  for (const org of orgs) {
    reminded += (await sendDueReminders(org.id)).sent;
    noShows += (await sweepNoShows(org.id)).flagged;
  }
  return NextResponse.json({ ok: true, orgs: orgs.length, reminded, noShows });
}

export const GET = runJob;
export const POST = runJob;
