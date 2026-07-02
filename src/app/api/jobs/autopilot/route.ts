import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma, withDbRetry } from "@/lib/prisma";
import { runAutopilotForOrg } from "@/lib/agent/autopilot";
import { collectDraftBatches } from "@/lib/agent/draft-batch";

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
  // Fail CLOSED: this fans out LLM spend + outbound email across orgs, so an
  // unset secret must lock it, not open it. Vercel Cron attaches the Bearer.
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // withDbRetry: crons fire into a possibly cold Neon compute; retry the first
  // query (backoff) so a scale-to-zero wake-up doesn't 500 the whole run.
  const orgs = await withDbRetry(() =>
    prisma.org.findMany({
      where: { type: "CLIENT", OR: [{ autopilotSync: true }, { autopilotDraft: true }, { autopilotSend: true }, { autopilotApprove: true }] },
      select: { id: true },
    }),
  );

  // Phase 1: collect drafts from Message Batches submitted on a prior pass
  // (50% token discount). Runs before the org loop so freshly landed drafts are
  // eligible for this pass's auto-approve/send. Best-effort — a collection
  // hiccup never blocks the run; unfinished batches are retried next pass.
  let collected = 0;
  try {
    const c = await collectDraftBatches();
    collected = c.drafted;
  } catch (e) {
    console.error("[autopilot] batch collection failed (will retry next pass):", e instanceof Error ? e.message : e);
  }

  let synced = 0;
  let drafted = 0;
  let batched = 0;
  let sent = 0;
  for (const org of orgs) {
    const r = await runAutopilotForOrg(org.id);
    synced += r.synced;
    drafted += r.drafted;
    batched += r.batched;
    sent += r.sent;
  }

  return NextResponse.json({ ok: true, orgs: orgs.length, synced, drafted, batched, collected, sent });
}

export const GET = runJob;
export const POST = runJob;
// Autopilot fans out across orgs and runs LLM drafting; give it headroom.
export const maxDuration = 300;
