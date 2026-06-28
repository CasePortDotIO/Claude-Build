import { requireOrg } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { hasGoogleOAuth, hasMicrosoftOAuth } from "@/lib/mailbox";
import { getLeadSource, leadSourceContext } from "@/lib/leadsource";
import { calcomWebhookUrl } from "@/lib/webhook-token";
import { Topbar } from "@/components/nav/Topbar";
import { ConnectionsClient, type MailboxVM } from "@/components/connections/ConnectionsClient";
import { LeadSourcesSection, type ConnectedSource } from "@/components/connections/LeadSourcesSection";
import { AutopilotSection } from "@/components/connections/AutopilotSection";

export default async function ConnectionsPage() {
  const ctx = await requireOrg();
  const [mailboxes, calendars, org, leadSources] = await Promise.all([
    prisma.mailbox.findMany({ where: { orgId: ctx.orgId }, orderBy: { createdAt: "asc" } }),
    prisma.calendarConnection.findMany({ where: { orgId: ctx.orgId }, orderBy: { createdAt: "asc" } }),
    prisma.org.findUnique({ where: { id: ctx.orgId }, select: { slackWebhookEnc: true, autopilotSync: true, autopilotDraft: true, autopilotSend: true } }),
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
          googleConfigured={hasGoogleOAuth()}
          microsoftConfigured={hasMicrosoftOAuth()}
          calendar={calendar ? { provider: calendar.provider, status: calendar.status, bookingLink: calendar.bookingLink } : null}
          slackConfigured={Boolean(org?.slackWebhookEnc)}
          calcomWebhookUrl={calcomWebhookUrl(ctx.orgId)}
        />
        <LeadSourcesSection connected={connectedSources} />
        <AutopilotSection
          initial={{
            sync: org?.autopilotSync ?? false,
            draft: org?.autopilotDraft ?? false,
            send: org?.autopilotSend ?? false,
          }}
        />
      </div>
    </>
  );
}
