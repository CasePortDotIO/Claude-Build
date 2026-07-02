import { prisma } from "@/lib/prisma";
import { pullFromSource } from "@/lib/leadsource";
import { ingestLeads } from "@/lib/import/ingest";
import { generateDraftsForLead, DraftGuardError } from "@/lib/agent/draft";
import { pendingBatchLeadIds, submitAutopilotDraftBatch } from "@/lib/agent/draft-batch";
import { hasAnthropic } from "@/lib/ai/config";
import { runFollowupsForOrg } from "@/lib/agent/followup";
import { sendAllApproved } from "@/lib/agent/send";
import { autoApproveAndSend } from "@/lib/agent/autosend";

/**
 * Autopilot — the always-on engine (M17). Turns the product from a one-time
 * reactivation tool ("vitamin") into infrastructure that works fresh leads on a
 * schedule without the operator re-uploading ("painkiller"). Per opted-in org:
 *
 *   1. SYNC   — pull connected lead sources and ingest fresh leads (incremental),
 *   2. DRAFT  — auto-generate drafts for fresh NEW leads (QUEUED for approval),
 *   3. SEND   — send drafts a human ALREADY approved.
 *
 * Every capability is opt-in (Org.autopilot*) and default-off. Three rails are
 * never bypassed for speed: ingest still runs the prior-contact + suppression +
 * verification gate; drafting still runs the contactability gate; sending still
 * runs the full send pipeline (caps, warmup, domain auth) and only ever sends
 * drafts a human approved. Autopilot automates the clicks, not the judgment.
 */

// Bound LLM spend per run so one big sync can't fan out into a huge drafting bill.
export const AUTO_DRAFT_BATCH = 25;

export interface AutopilotRunResult {
  orgId: string;
  synced: number; // fresh leads ingested from connected sources
  drafted: number; // fresh leads auto-drafted inline (queued for approval)
  batched: number; // fresh leads submitted to a discounted Message Batch (drafts land next pass)
  skippedDrafts: number; // leads a draft guard refused (opted-out, suppressed, terminal)
  followedUp: number; // follow-up drafts queued for leads that went quiet
  closedOut: number; // leads closed after exhausting their follow-up touches
  autoApproved: number; // high-confidence drafts auto-approved (auto-send mode)
  sent: number; // drafts sent (auto-approved + already-approved)
}

export async function runAutopilotForOrg(orgId: string): Promise<AutopilotRunResult> {
  const result: AutopilotRunResult = { orgId, synced: 0, drafted: 0, batched: 0, skippedDrafts: 0, followedUp: 0, closedOut: 0, autoApproved: 0, sent: 0 };

  const org = await prisma.org.findUnique({
    where: { id: orgId },
    select: { id: true, name: true, brandName: true, autopilotSync: true, autopilotDraft: true, autopilotSend: true, autopilotApprove: true },
  });
  if (!org) return result;

  // (1) SYNC — pull each connected source and run the SAME ingest pipeline as a
  // manual import. Enabling autopilotSync is the standing prior-contact
  // attestation for the connected sources (the operator attested when wiring
  // them up; the toggle re-affirms it). One failing source never blocks others.
  if (org.autopilotSync) {
    const conns = await prisma.leadSourceConnection.findMany({
      where: { orgId, status: "CONNECTED", provider: { not: "CSV" } },
    });
    for (const conn of conns) {
      try {
        const { leads } = await pullFromSource(conn);
        if (leads.length === 0) continue;
        const res = await ingestLeads(leads, {
          orgId,
          name: `${conn.provider} autosync`,
          source: conn.provider.toLowerCase(),
          consentBasis: "PRIOR_INQUIRY",
          priorContactAttested: true,
        });
        if (res.ok) {
          result.synced += res.imported;
          await prisma.leadSourceConnection.update({
            where: { id: conn.id },
            data: { lastSyncAt: new Date(), lastImported: res.imported },
          });
        }
      } catch {
        /* one bad source never blocks the others */
      }
    }
  }

  // (2) DRAFT — auto-generate for the oldest fresh leads, bounded per run. Drafts
  // land in PENDING_APPROVAL; nothing is sent here. The contactability gate
  // inside generateDraftsForLead refuses opted-out / suppressed / terminal leads.
  if (org.autopilotDraft) {
    // Skip leads already in-flight in a submitted batch so nothing double-drafts.
    const inFlight = await pendingBatchLeadIds(orgId);
    const fresh = await prisma.lead.findMany({
      where: { orgId, status: "NEW", ...(inFlight.length ? { id: { notIn: inFlight } } : {}) },
      orderBy: { createdAt: "asc" },
      take: AUTO_DRAFT_BATCH,
      select: { id: true },
    });
    const operatorName = org.brandName || org.name || "the team";

    // When Claude is keyed, submit the whole tranche as a Message Batch (50%
    // discount; drafts land on the next cron pass). Stub mode (no key) and any
    // batch-submit failure fall back to inline drafting so autopilot never stalls.
    let inline = fresh;
    if (fresh.length > 0 && (await hasAnthropic())) {
      try {
        result.batched = await submitAutopilotDraftBatch(orgId, fresh.map((f) => f.id), operatorName);
        inline = [];
      } catch (e) {
        console.error(`[autopilot] batch submit failed for org ${orgId}; drafting inline:`, e instanceof Error ? e.message : e);
      }
    }
    for (const lead of inline) {
      try {
        await generateDraftsForLead({ orgId, leadId: lead.id, operatorName, bulk: true });
        result.drafted += 1;
      } catch (e) {
        if (e instanceof DraftGuardError) result.skippedDrafts += 1;
        else throw e;
      }
    }
  }

  // (2b) FOLLOW-UP — multi-touch nudges for leads that were sent but went quiet.
  // Same approval gate as drafting (follow-ups land PENDING_APPROVAL, never sent
  // here), same contactability gate, and the configured gap is honoured. Most
  // reactivations land on touch 2–3, so this is where much of the recovery comes
  // from. Gated under autopilotDraft since it produces approval-queued drafts.
  if (org.autopilotDraft) {
    const fu = await runFollowupsForOrg(orgId);
    result.followedUp = fu.generated;
    result.closedOut = fu.closed;
  }

  // (2c) AUTO-SEND — when the operator turns off the approval requirement, auto-
  // approve + send the drafts the agent is confident about (low-confidence ones
  // still wait in the queue). Every send rail still applies; see autosend.ts.
  if (org.autopilotApprove) {
    const res = await autoApproveAndSend({ orgId });
    result.autoApproved = res.approved;
    result.sent += res.sent;
  }

  // (3) SEND — drafts a human already APPROVED (or auto-approved above that a
  // rail deferred). sendAllApproved enforces every send rail (suppression,
  // daily/hourly caps, warmup ramp, domain auth, circuit breaker). Collapses
  // time-to-first-touch.
  if (org.autopilotSend || org.autopilotApprove) {
    const res = await sendAllApproved(orgId);
    result.sent += res.sent;
  }

  return result;
}
