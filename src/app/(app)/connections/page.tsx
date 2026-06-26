import { requireOrg } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { hasGoogleOAuth } from "@/lib/mailbox";
import { Topbar } from "@/components/nav/Topbar";
import { ConnectionsClient, type MailboxVM } from "@/components/connections/ConnectionsClient";

export default async function ConnectionsPage() {
  const ctx = await requireOrg();
  const mailboxes = await prisma.mailbox.findMany({ where: { orgId: ctx.orgId }, orderBy: { createdAt: "asc" } });
  const vms: MailboxVM[] = mailboxes.map((m) => ({
    id: m.id,
    email: m.email,
    provider: m.provider,
    status: m.status,
    sentToday: m.sentToday,
    dailyCap: m.dailyCap,
  }));

  return (
    <>
      <Topbar title="Connections" />
      <div className="ws-rise flex-1 px-[34px] pb-[60px] pt-[30px]">
        <ConnectionsClient mailboxes={vms} googleConfigured={hasGoogleOAuth()} />
      </div>
    </>
  );
}
