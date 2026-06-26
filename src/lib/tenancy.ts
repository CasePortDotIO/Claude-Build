import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

/**
 * The single choke point for tenant-scoped data access.
 *
 * Every query that touches an org-owned table MUST go through `orgScoped(orgId)`
 * so the `orgId` filter is never forgotten. Server actions and route handlers
 * resolve the active org from the session (see auth-helpers) and then call this.
 *
 * This is deliberately a thin, explicit wrapper rather than Prisma middleware:
 * the scoping is visible at every call site and trivially unit-testable
 * (see tenancy.test.ts, which proves org B cannot read org A's leads).
 */
export function orgScoped(orgId: string) {
  if (!orgId) throw new Error("orgScoped: orgId is required");

  return {
    orgId,

    lead: {
      findMany: (args?: Omit<Prisma.LeadFindManyArgs, "where"> & { where?: Prisma.LeadWhereInput }) =>
        prisma.lead.findMany({ ...args, where: { ...args?.where, orgId } }),

      findFirst: (args?: Omit<Prisma.LeadFindFirstArgs, "where"> & { where?: Prisma.LeadWhereInput }) =>
        prisma.lead.findFirst({ ...args, where: { ...args?.where, orgId } }),

      count: (args?: { where?: Prisma.LeadWhereInput }) =>
        prisma.lead.count({ where: { ...args?.where, orgId } }),

      // Writes always stamp orgId, ignoring any orgId a caller might pass.
      create: (args: { data: Omit<Prisma.LeadUncheckedCreateInput, "orgId"> }) =>
        prisma.lead.create({ data: { ...args.data, orgId } }),

      // Guarded update: the where clause is intersected with orgId, so an id
      // belonging to another org simply matches nothing.
      updateMany: (args: { where?: Prisma.LeadWhereInput; data: Prisma.LeadUpdateManyMutationInput }) =>
        prisma.lead.updateMany({ where: { ...args.where, orgId }, data: args.data }),

      deleteMany: (args?: { where?: Prisma.LeadWhereInput }) =>
        prisma.lead.deleteMany({ where: { ...args?.where, orgId } }),
    },

    leadImport: {
      findMany: (args?: Omit<Prisma.LeadImportFindManyArgs, "where"> & { where?: Prisma.LeadImportWhereInput }) =>
        prisma.leadImport.findMany({ ...args, where: { ...args?.where, orgId } }),

      findFirst: (args?: Omit<Prisma.LeadImportFindFirstArgs, "where"> & { where?: Prisma.LeadImportWhereInput }) =>
        prisma.leadImport.findFirst({ ...args, where: { ...args?.where, orgId } }),

      create: (args: { data: Omit<Prisma.LeadImportUncheckedCreateInput, "orgId"> }) =>
        prisma.leadImport.create({ data: { ...args.data, orgId } }),
    },

    suppression: {
      findMany: (args?: Omit<Prisma.SuppressionEntryFindManyArgs, "where"> & { where?: Prisma.SuppressionEntryWhereInput }) =>
        prisma.suppressionEntry.findMany({ ...args, where: { ...args?.where, orgId } }),

      findFirst: (args?: Omit<Prisma.SuppressionEntryFindFirstArgs, "where"> & { where?: Prisma.SuppressionEntryWhereInput }) =>
        prisma.suppressionEntry.findFirst({ ...args, where: { ...args?.where, orgId } }),
    },

    audit: {
      create: (args: { data: Omit<Prisma.AuditLogUncheckedCreateInput, "orgId"> }) =>
        prisma.auditLog.create({ data: { ...args.data, orgId } }),
    },

    // M2 reads (writes happen in the agent orchestrators, always orgId-filtered).
    draft: {
      findMany: (args?: Omit<Prisma.DraftFindManyArgs, "where"> & { where?: Prisma.DraftWhereInput }) =>
        prisma.draft.findMany({ ...args, where: { ...args?.where, orgId } }),

      findFirst: (args?: Omit<Prisma.DraftFindFirstArgs, "where"> & { where?: Prisma.DraftWhereInput }) =>
        prisma.draft.findFirst({ ...args, where: { ...args?.where, orgId } }),

      count: (args?: { where?: Prisma.DraftWhereInput }) =>
        prisma.draft.count({ where: { ...args?.where, orgId } }),
    },

    voiceProfile: {
      find: () => prisma.voiceProfile.findUnique({ where: { orgId } }),
    },

    voiceSample: {
      count: () => prisma.voiceSample.count({ where: { orgId } }),
      findMany: (args?: Omit<Prisma.VoiceSampleFindManyArgs, "where"> & { where?: Prisma.VoiceSampleWhereInput }) =>
        prisma.voiceSample.findMany({ ...args, where: { ...args?.where, orgId } }),
    },

    agentRun: {
      findMany: (args?: Omit<Prisma.AgentRunFindManyArgs, "where"> & { where?: Prisma.AgentRunWhereInput }) =>
        prisma.agentRun.findMany({ ...args, where: { ...args?.where, orgId } }),

      count: (args?: { where?: Prisma.AgentRunWhereInput }) =>
        prisma.agentRun.count({ where: { ...args?.where, orgId } }),
    },

    memory: {
      count: (args?: { where?: Prisma.MemoryEmbeddingWhereInput }) =>
        prisma.memoryEmbedding.count({ where: { ...args?.where, orgId } }),
    },
  };
}

export type OrgScopedClient = ReturnType<typeof orgScoped>;
