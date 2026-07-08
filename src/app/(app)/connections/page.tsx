import { requireOrg } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { exploreModeEnabled } from "@/lib/config/flags";
import { hasGoogleOAuth, hasMicrosoftOAuth } from "@/lib/mailbox";
import { getLeadSource, leadSourceContext } from "@/lib/leadsource";
import { calcomWebhookUrl, leadWebhookUrl } from "@/lib/webhook-token";
import { Topbar } from "@/components/nav/Topbar";
import { ConnectionsClient, type MailboxVM } from "@/components/connections/ConnectionsClient";
import { LeadSourcesSection, type ConnectedSource } from "@/components/connections/LeadSourcesSection";
import { AutopilotSection } from "@/components/connections/AutopilotSection";

export default async function ConnectionsPage() {
  const ctx = await requireOrg();
  const explore = await exploreModeEnabled();
  const [mailboxes, calendars, org, leadSources] = await Promise.all([
    prisma.mailbox.findMany({ where: { orgId: ctx.orgId }, orderBy: { createdAt: "asc" } }),
    prisma.calendarConnection.findMany({ where: { orgId: ctx.orgId }, orderBy: { createdAt: "asc" } }),
    prisma.org.findUnique({ where: { id: ctx.orgId }, select: { slackWebhookEnc: true, autopilotSync: true, autopilotDraft: true, autopilotSend: true, autopilotApprove: true } }),
    prisma.leadSourceConnection.findMany({ where: { orgId: ctx.orgId } }),
  ]);

  const connectedSources: ConnectedSource[] = leadSources.map((c) => {
    const src = getLeadSource(c.provider);
    return {
      provider: c.provider,
      status: c.status,
      live: src ? src.isLive(leadSourceContext(c)) : false,
      lastImported: c.lastImported,
    };
  });
  const vms: MailboxVM[] = mailboxes.map((m) => ({
    id: m.id,
    email: m.email,
    provider: m.provider,
    status: m.status,
    sentToday: m.sentToday,
    dailyCap: m.dailyCap,
  }));
  const calendar = calendars.find((c) => c.status === "CONNECTED") ?? calendars[0];

  return (
    <>
      <Topbar title="Connections" subtitle="Email, calendar, lead sources & autopilot" />
      <div className="ws-rise flex-1 px-4 pb-[60px] pt-[30px] sm:px-6 lg:px-[34px]">
        <ConnectionsClient
          mailboxes={vms}
          googleConfigured={await hasGoogleOAuth()}
          microsoftConfigured={await hasMicrosoftOAuth()}
          calendar={calendar ? { provider: calendar.provider, status: calendar.status, bookingLink: calendar.bookingLink } : null}
          slackConfigured={Boolean(org?.slackWebhookEnc)}
          calcomWebhookUrl={calcomWebhookUrl(ctx.orgId)}
          leadWebhookUrl={leadWebhookUrl(ctx.orgId)}
          exploreMode={explore}
        />
        <LeadSourcesSection connected={connectedSources} exploreMode={explore} />
        <AutopilotSection
          initial={{
            sync: org?.autopilotSync ?? false,
            draft: org?.autopilotDraft ?? false,
            send: org?.autopilotSend ?? false,
            approve: org?.autopilotApprove ?? false,
          }}
        />
      </div>
    </>
  );
}
