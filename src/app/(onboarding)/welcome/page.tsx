import { requireOrg } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { hasGoogleOAuth, hasMicrosoftOAuth } from "@/lib/mailbox";
import { resolveBranding } from "@/lib/branding";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import { isSampleMailbox } from "@/lib/sample/seed";

/**
 * Post-signup setup wizard. Moves the "connect email + calendar" basics out of
 * the dashboard and into a focused, skippable flow, so by the time the operator
 * lands in the app everything is wired up except their first CSV.
 */
export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const ctx = await requireOrg();
  const sp = await searchParams;

  const [mailboxes, calendars, org] = await Promise.all([
    prisma.mailbox.findMany({ where: { orgId: ctx.orgId }, orderBy: { createdAt: "asc" } }),
    prisma.calendarConnection.findMany({ where: { orgId: ctx.orgId }, orderBy: { createdAt: "asc" } }),
    prisma.org.findUnique({ where: { id: ctx.orgId }, select: { name: true, brandName: true, brandColor: true, type: true } }),
  ]);

  // The seeded `.sample` demo mailbox doesn't count as the operator's real
  // sending identity — onboarding should still prompt them to connect one.
  const connectedMailbox = mailboxes.find((m) => m.status === "CONNECTED" && !isSampleMailbox(m.email));
  const connectedCalendar = calendars.find((c) => c.status === "CONNECTED");
  const branding = resolveBranding(org ?? null);

  const notice =
    sp.connected
      ? { kind: "connected" as const, text: `${sp.connected === "microsoft" ? "Microsoft 365" : "Gmail"} connected.` }
      : sp.error
        ? { kind: "error" as const, text: errorText(sp.error) }
        : null;

  return (
    <OnboardingWizard
      brandName={branding.name}
      brandColor={branding.color}
      firstName={(ctx.name ?? "").split(" ")[0] ?? ""}
      emailConnected={Boolean(connectedMailbox)}
      emailLabel={connectedMailbox?.email ?? null}
      calendarConnected={Boolean(connectedCalendar)}
      bookingLink={connectedCalendar?.bookingLink ?? null}
      googleConfigured={hasGoogleOAuth()}
      microsoftConfigured={hasMicrosoftOAuth()}
      notice={notice}
    />
  );
}

function errorText(code: string): string {
  switch (code) {
    case "google_not_configured":
    case "microsoft_not_configured":
      return "That provider isn't set up yet — use the demo mailbox for now and connect the real one later.";
    case "exchange_failed":
      return "Couldn't finish connecting. Please try again.";
    case "org_mismatch":
    case "bad_state":
      return "Connection expired — please try again.";
    default:
      return "Something went wrong — please try again.";
  }
}
