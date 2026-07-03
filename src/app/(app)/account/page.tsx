import { requireOrg } from "@/lib/auth-helpers";
import { ROLE_RANK } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/nav/Topbar";
import { AccountClient } from "@/components/account/AccountClient";
import { TeamSection, type MemberVM, type InviteVM } from "@/components/account/TeamSection";
import { BillingSection } from "@/components/account/BillingSection";
import { IntegrationsSection } from "@/components/account/IntegrationsSection";
import { UsageMeter } from "@/components/account/UsageMeter";
import { isBillingConfigured, planDisplay } from "@/lib/billing/stripe";
import { readMeter, resolveTier } from "@/lib/billing/entitlements";
import { configuredStatus, SECRET_KEYS } from "@/lib/config/secrets";

const TIER_LABEL: Record<string, string> = {
  NONE: "No plan",
  TRIAL: "Trial",
  FRONT_END: "Starter",
  OTO1: "Unlimited Lists",
  CONTINUITY: "The Engine",
  PERFORMANCE: "Performance",
  RESELLER: "Reseller",
};

export default async function AccountPage() {
  const ctx = await requireOrg();
  const [org, memberships, invites] = await Promise.all([
    prisma.org.findUniqueOrThrow({
      where: { id: ctx.orgId },
      select: {
        name: true, brandName: true, billingStatus: true, canceledAt: true, stripeSubscriptionId: true, currentPeriodEnd: true,
        planTier: true, leadsDraftedThisPeriod: true, meterPeriodStart: true,
      },
    }),
    prisma.membership.findMany({
      where: { orgId: ctx.orgId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.invitation.findMany({ where: { orgId: ctx.orgId, acceptedAt: null }, orderBy: { createdAt: "desc" } }),
  ]);

  const isAdmin = ROLE_RANK[ctx.role] >= ROLE_RANK.CLIENT_ADMIN;
  const [billingOn, plan, integrationStatus] = await Promise.all([
    isBillingConfigured(),
    planDisplay(),
    isAdmin ? configuredStatus(SECRET_KEYS) : Promise.resolve({}),
  ]);
  const members: MemberVM[] = memberships.map((m) => ({
    userId: m.user.id,
    name: m.user.name,
    email: m.user.email,
    role: m.role,
    isYou: m.user.id === ctx.userId,
  }));
  const inviteVMs: InviteVM[] = invites.map((i) => ({ id: i.id, email: i.email, role: i.role }));

  // Usage meter (only meaningful once billing is live; the meter is inactive in dev).
  const meter = readMeter(org, new Date());
  const usage = {
    used: meter.used,
    soft: meter.soft,
    overSoft: meter.overSoft,
    atHardCap: meter.atHardCap,
    planLabel: TIER_LABEL[resolveTier(org)] ?? "Plan",
  };

  return (
    <>
      <Topbar title="Account" subtitle="Workspace, team & billing" action={null} />
      <div className="ws-rise max-w-[760px] flex-1 px-4 pb-[60px] pt-[30px] sm:px-6 lg:px-[34px]">
        <AccountClient
          orgName={org.brandName || org.name}
          billingStatus={org.billingStatus}
          canceled={org.billingStatus === "canceled"}
          stripeManaged={billingOn}
        />
        {billingOn && (
          <BillingSection
            hasSubscription={Boolean(org.stripeSubscriptionId)}
            billingStatus={org.billingStatus}
            planName={plan.name}
            priceLabel={plan.price}
            renewsOn={org.currentPeriodEnd ? org.currentPeriodEnd.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null}
            isAdmin={isAdmin}
          />
        )}
        {billingOn && usage.soft > 0 && <UsageMeter usage={usage} />}
        <TeamSection members={members} invites={inviteVMs} isAdmin={isAdmin} />
        <IntegrationsSection status={integrationStatus} isAdmin={isAdmin} />
      </div>
    </>
  );
}
