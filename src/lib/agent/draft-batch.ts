import { prisma } from "@/lib/prisma";
import { getAiConfig } from "@/lib/ai/config";
import { submitToolUseBatch, fetchToolUseBatch, type ToolUseRequest } from "@/lib/ai/anthropic";
import { buildDraftSystemPrompt, buildDraftUserPrompt, draftToolSchema } from "@/lib/ai/prompts";
import { buildDraftContext, persistDraftResult, DraftGuardError } from "@/lib/agent/draft";
import { rawDraftToResult, type RawDraftToolInput } from "@/lib/ai/provider";

/**
 * Batched autopilot drafting via Anthropic Message Batches — 50% token discount
 * for work that doesn't need to be instant. Two-phase, riding the existing cron:
 *
 *   submit  — build each lead's draft request through the SAME context builder
 *             (guards, voice, memory, cohort) as realtime drafting, submit one
 *             batch per org, record the in-flight lead ids.
 *   collect — next cron pass: fetch ended batches, re-run the guards (a lead may
 *             have opted out or been drafted manually since submit), and persist
 *             through the SAME persistence path (fidelity, supersede, AgentRun,
 *             AWAITING_APPROVAL). Batched runs log cost at the 50% batch rate.
 *
 * Autopilot never stalls on this: if a submit fails, the caller falls back to
 * inline drafting, and batches that never end are expired so their leads
 * re-enter the fresh pool.
 */

// Provider guarantees results within 24h; past this we assume the batch is lost.
const BATCH_MAX_AGE_MS = 26 * 3_600_000;

/** Lead ids currently in-flight in submitted batches for an org (skip re-submitting). */
export async function pendingBatchLeadIds(orgId: string): Promise<string[]> {
  const open = await prisma.draftBatch.findMany({
    where: { orgId, status: "SUBMITTED" },
    select: { leadIds: true },
  });
  return open.flatMap((b) => b.leadIds);
}

/**
 * Submit one batch of draft requests for an org's fresh leads. Returns how many
 * leads were included (guard-refused leads are skipped, same as inline).
 */
export async function submitAutopilotDraftBatch(
  orgId: string,
  leadIds: string[],
  operatorName: string,
): Promise<number> {
  const cfg = (await getAiConfig()).anthropic;
  const requests: { customId: string; params: ToolUseRequest }[] = [];
  const included: string[] = [];

  for (const leadId of leadIds) {
    try {
      const { input } = await buildDraftContext({ orgId, leadId, operatorName, bulk: true });
      requests.push({
        customId: leadId,
        params: {
          model: cfg.fastModel,
          system: buildDraftSystemPrompt(input),
          userContent: buildDraftUserPrompt(input),
          tool: draftToolSchema(input.variantCount),
          maxTokens: 2000,
        },
      });
      included.push(leadId);
    } catch (e) {
      if (e instanceof DraftGuardError) continue; // suppressed/terminal — same skip as inline
      throw e;
    }
  }
  if (requests.length === 0) return 0;

  const providerBatchId = await submitToolUseBatch(requests);
  await prisma.draftBatch.create({ data: { orgId, providerBatchId, leadIds: included, operatorName } });
  return included.length;
}

export interface CollectResult {
  batchesChecked: number;
  drafted: number;
  skipped: number;
  failedBatches: number;
}

/** Collect every ended batch across orgs and persist the resulting drafts. */
export async function collectDraftBatches(): Promise<CollectResult> {
  const out: CollectResult = { batchesChecked: 0, drafted: 0, skipped: 0, failedBatches: 0 };
  const open = await prisma.draftBatch.findMany({
    where: { status: "SUBMITTED" },
    orderBy: { createdAt: "asc" },
    take: 20,
  });

  for (const batch of open) {
    out.batchesChecked += 1;
    const expired = Date.now() - batch.createdAt.getTime() > BATCH_MAX_AGE_MS;

    let fetched: Awaited<ReturnType<typeof fetchToolUseBatch>>;
    try {
      fetched = await fetchToolUseBatch(batch.providerBatchId);
    } catch (e) {
      console.error(`[draft-batch] status check failed for ${batch.providerBatchId}:`, e instanceof Error ? e.message : e);
      if (expired) {
        await prisma.draftBatch.update({ where: { id: batch.id }, data: { status: "FAILED" } });
        out.failedBatches += 1;
      }
      continue;
    }

    if (!fetched.done) {
      if (expired) {
        // Leads are still NEW, so expiring the batch returns them to the fresh
        // pool — the next cron drafts them inline instead of losing them.
        await prisma.draftBatch.update({ where: { id: batch.id }, data: { status: "FAILED" } });
        out.failedBatches += 1;
      }
      continue;
    }

    const startMs = Date.now();
    for (const item of fetched.items) {
      if (!item.ok) {
        out.skipped += 1;
        continue;
      }
      const leadId = item.customId;
      try {
        // Re-run the full context (contactability gate + fresh retrieval for
        // fidelity scoring). A lead that opted out, got suppressed, or was
        // drafted manually since submit is skipped — last state wins.
        const { lead, input } = await buildDraftContext({
          orgId: batch.orgId,
          leadId,
          operatorName: batch.operatorName,
          bulk: true,
        });
        if (lead.status !== "NEW") {
          out.skipped += 1;
          continue;
        }
        const result = rawDraftToResult(
          item.input as RawDraftToolInput,
          item.usage,
          "anthropic",
          item.model || (await getAiConfig()).anthropic.fastModel,
        );
        await persistDraftResult({
          orgId: batch.orgId,
          leadId,
          lead,
          input,
          result,
          startMs,
          costMultiplier: 0.5, // Message Batches bill at 50%
        });
        out.drafted += 1;
      } catch (e) {
        if (e instanceof DraftGuardError) {
          out.skipped += 1;
          continue;
        }
        console.error(`[draft-batch] persist failed for lead ${leadId}:`, e instanceof Error ? e.message : e);
        out.skipped += 1;
      }
    }

    await prisma.draftBatch.update({ where: { id: batch.id }, data: { status: "DONE" } });
  }

  return out;
}
