import type { Metadata } from "next";
import { requireOrg } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { orgScoped } from "@/lib/tenancy";
import { resolveBranding } from "@/lib/branding";
import { listMemberships } from "@/server/actions/org";
import { Sidebar } from "@/components/nav/Sidebar";
import { CommandPalette } from "@/components/nav/CommandPalette";
import { Toaster } from "@/components/ui/Toast";

// White-label the browser tab too: client users never see "The Warm Sweep".
export async function generateMetadata(): Promise<Metadata> {
  const ctx = await requireOrg();
  const org = await prisma.org.findUnique({ where: { id: ctx.orgId }, select: { brandName: true, name: true } });
  const name = org?.brandName || org?.name || "The Warm Sweep";
  return { title: `${name} — Coach. Don't Chase.` };
}

// The authenticated app shell. requireOrg() redirects to /sign-in if there's
// no active org, so every page under (app) is guaranteed an org context.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireOrg();
  const db = orgScoped(ctx.orgId);
  const [org, pendingDrafts, needsReview, memberships] = await Promise.all([
    prisma.org.findUnique({
      where: { id: ctx.orgId },
      select: { name: true, brandName: true, brandColor: true, type: true, parentAgencyId: true },
    }),
    db.draft.count({ where: { status: "PENDING_APPROVAL" } }),
    prisma.conversation.count({ where: { orgId: ctx.orgId, status: "NEEDS_REVIEW" } }),
    listMemberships(ctx.userId),
  ]);

  // White-label: resolve the brand the current user should see for the active org.
  const agency = org?.parentAgencyId
    ? await prisma.org.findUnique({ where: { id: org.parentAgencyId }, select: { brandName: true, name: true } })
    : null;
  const branding = resolveBranding(org ?? null, agency ? `by ${agency.brandName || agency.name}` : null);

  const isAgencyAdmin = memberships.some((m) => m.role === "AGENCY_ADMIN");

  return (
    <div className="flex min-h-screen w-full bg-parchment text-ink">
      <Sidebar
        userName={ctx.name ?? ctx.email}
        orgName={org?.brandName || org?.name || "Workspace"}
        badges={{ pendingDrafts, needsReview }}
        branding={branding}
        memberships={memberships}
        activeOrgId={ctx.orgId}
        isAgencyAdmin={isAgencyAdmin}
      />
      <main className="ws-scroll flex min-w-0 flex-1 flex-col">{children}</main>
      <CommandPalette isAgencyAdmin={isAgencyAdmin} />
      <Toaster />
    </div>
  );
}
