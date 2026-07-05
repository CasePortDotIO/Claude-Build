"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth, updateSession } from "@/lib/auth";
import { requireOrg } from "@/lib/auth-helpers";
import { agencyForUser } from "@/lib/agency";
import { assertEntitled } from "@/lib/billing/entitle";
import { EntitlementError } from "@/lib/billing/entitlement-errors";
import type { Role } from "@prisma/client";

export interface OrgActionResult {
  ok: boolean;
  error?: string;
  message?: string;
  orgId?: string;
}

/** Switch the active org (membership re-verified in the JWT callback). */
export async function switchOrgAction(orgId: string): Promise<OrgActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Not signed in." };

  const membership = await prisma.membership.findUnique({ where: { userId_orgId: { userId, orgId } } });
  if (!membership) return { ok: false, error: "You don't have access to that workspace." };

  // The update payload is forwarded to the jwt callback's `session` arg, where
  // we re-verify membership before trusting it. Cast: NextAuth types the update
  // payload narrowly, but the callback reads our custom field.
  await updateSession({ activeOrgId: orgId } as unknown as Parameters<typeof updateSession>[0]);
  revalidatePath("/", "layout");
  return { ok: true, orgId };
}

function slugify(name: string): string {
  return (name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "client");
}

/** Agency admin creates a new client workspace under their agency. */
export async function createClientAction(opts: { name: string; brandName?: string; clientPriceCents?: number }): Promise<OrgActionResult> {
  const ctx = await requireOrg();

  // Authorization: must administer an agency (works regardless of active org).
  const agency = await agencyForUser(ctx.userId, ctx.orgId);
  if (!agency) return { ok: false, error: "Only agency admins can add clients." };

  // Entitlement gate — the reseller tier caps how many client accounts an agency
  // can run (Standard 15, Agency unlimited). Unenforced when billing isn't set up.
  try {
    await assertEntitled(agency.id, "subaccount.create");
  } catch (e) {
    if (e instanceof EntitlementError) return { ok: false, error: e.message };
    throw e;
  }

  const name = opts.name.trim();
  if (!name) return { ok: false, error: "Client name is required." };

  let slug = slugify(name);
  if (await prisma.org.findUnique({ where: { slug } })) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;

  const client = await prisma.org.create({
    data: {
      name,
      slug,
      type: "CLIENT",
      parentAgencyId: agency.id,
      brandName: opts.brandName?.trim() || name,
      clientPriceCents: opts.clientPriceCents ?? 0,
    },
  });
  // The agency admin is also an admin of the new client.
  await prisma.membership.create({ data: { userId: ctx.userId, orgId: client.id, role: "CLIENT_ADMIN" } });
  await prisma.auditLog.create({ data: { orgId: agency.id, actorId: ctx.userId, action: "client.create", targetType: "Org", targetId: client.id } });

  revalidatePath("/clients");
  return { ok: true, orgId: client.id, message: `Created client ${name}.` };
}

/** Update a client org's white-label branding + billing (agency admin). */
export async function updateClientBrandingAction(opts: {
  orgId: string;
  brandName?: string;
  brandColor?: string;
  brandLogoUrl?: string;
  fromDomain?: string;
  clientPriceCents?: number;
}): Promise<OrgActionResult> {
  const ctx = await requireOrg();
  const agency = await agencyForUser(ctx.userId, ctx.orgId);
  if (!agency) return { ok: false, error: "Only agency admins can edit clients." };

  // Authorization: the target must be a client of this admin's agency.
  const client = await prisma.org.findFirst({ where: { id: opts.orgId, parentAgencyId: agency.id } });
  if (!client) return { ok: false, error: "That client isn't in your agency." };

  await prisma.org.update({
    where: { id: client.id },
    data: {
      brandName: opts.brandName?.trim() || client.brandName,
      brandColor: opts.brandColor?.trim() || client.brandColor,
      brandLogoUrl: opts.brandLogoUrl?.trim() ?? client.brandLogoUrl,
      fromDomain: opts.fromDomain?.trim() ?? client.fromDomain,
      clientPriceCents: opts.clientPriceCents ?? client.clientPriceCents,
    },
  });
  revalidatePath("/clients");
  return { ok: true, message: "Client updated." };
}

export async function listMemberships(userId: string): Promise<{ orgId: string; name: string; role: Role; type: string }[]> {
  const memberships = await prisma.membership.findMany({
    where: { userId },
    include: { org: { select: { id: true, name: true, type: true, brandName: true } } },
    orderBy: { createdAt: "asc" },
  });
  return memberships.map((m) => ({ orgId: m.orgId, name: m.org.brandName || m.org.name, role: m.role, type: m.org.type }));
}
