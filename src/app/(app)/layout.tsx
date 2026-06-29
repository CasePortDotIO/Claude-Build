import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { orgScoped } from "@/lib/tenancy";
import { isBillingConfigured, subscriptionActive } from "@/lib/billing/stripe";
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
      select: { name: true, brandName: true, brandColor: true, type: true, parentAgencyId: true, billingStatus: true },
    }),
    db.draft.count({ where: { status: "PENDING_APPROVAL" } }),
    prisma.conversation.count({ where: { orgId: ctx.orgId, status: "NEEDS_REVIEW" } }),
    listMemberships(ctx.userId),
  ]);

  // Paid-only: once billing is configured, a workspace without an active
  // subscription is walled behind /billing (which lives outside this layout).
  // When billing isn't configured (local/dev/pre-setup), the app stays open so
  // the operator can connect Stripe in the first place.
  if (org && !subscriptionActive(org.billingStatus) && (await isBillingConfigured())) {
    redirect("/billing");
  }

  // White-label: resolve the brand the current user should see for the active org.
  const agency = org?.parentAgencyId
    ? await prisma.org.findUnique({ where: { id: org.parentAgencyId }, select: { brandName: true, name: true } })
    : null;
  const branding = resolveBranding(org ?? null, agency ? `by ${agency.brandName || agency.name}` : null);

  const isAgencyAdmin = memberships.some((m) => m.role === "AGENCY_ADMIN");

  return (
    <div className="flex min-h-screen w-full bg-parchment text-ink">
      {/* Keyboard users can jump past the nav straight to the page content. */}
      <a
        href="#main-content"
        className="sr-only z-[200] focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:rounded-lg focus:bg-sweep focus:px-4 focus:py-2 focus:text-[13px] focus:font-semibold focus:text-white"
      >
        Skip to content
      </a>
      <Sidebar
        userName={ctx.name ?? ctx.email}
        orgName={org?.brandName || org?.name || "Workspace"}
        badges={{ pendingDrafts, needsReview }}
        branding={branding}
        memberships={memberships}
        activeOrgId={ctx.orgId}
        isAgencyAdmin={isAgencyAdmin}
      />
      <main id="main-content" tabIndex={-1} className="ws-scroll flex min-w-0 flex-1 flex-col outline-none">{children}</main>
      <CommandPalette isAgencyAdmin={isAgencyAdmin} />
      <Toaster />
    </div>
  );
}
