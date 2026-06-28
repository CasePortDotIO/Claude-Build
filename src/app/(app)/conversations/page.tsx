import { requireOrg } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/nav/Topbar";
import { ConversationsClient, type ConversationVM } from "@/components/conversations/ConversationsClient";
import { timeAgo } from "@/lib/format";

function initials(name: string): string {
  return name.includes("@")
    ? name.slice(0, 2).toUpperCase()
    : name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

export default async function ConversationsPage() {
  const ctx = await requireOrg();

  const conversations = await prisma.conversation.findMany({
    where: { orgId: ctx.orgId },
    orderBy: { updatedAt: "desc" },
    include: {
      lead: { select: { firstName: true, lastName: true, email: true, status: true } },
      messages: { orderBy: { createdAt: "asc" } },
      booking: { select: { startsAt: true, meetingUrl: true } },
    },
  });

  const vms: ConversationVM[] = conversations.map((c) => {
    const name = [c.lead.firstName, c.lead.lastName].filter(Boolean).join(" ") || c.lead.email;
    const last = c.messages[c.messages.length - 1];
    return {
      id: c.id,
      leadId: c.leadId,
      leadName: name,
      leadEmail: c.lead.email,
      initials: initials(name),
      status: c.status,
      leadStatus: c.lead.status,
      reviewReason: c.reviewReason,
      booking: c.booking
        ? {
            whenLabel: c.booking.startsAt.toLocaleString("en-US", { weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
            meetingUrl: c.booking.meetingUrl,
          }
        : null,
      lastSnippet: last ? last.body.replace(/\n+/g, " ").slice(0, 80) : c.subject,
      when: timeAgo(c.lastInboundAt ?? c.lastOutboundAt ?? c.updatedAt),
      messages: c.messages.map((m) => ({
        id: m.id,
        direction: m.direction,
        subject: m.subject,
        body: m.body,
        when: timeAgo(m.createdAt),
        isAutoReply: m.isAutoReply,
        isBounce: m.isBounce,
      })),
    };
  });

  return (
    <>
      <Topbar title="Conversations" subtitle="Threads your agent is handling" />
      <div className="ws-rise flex-1 px-[34px] pb-[60px] pt-[30px]">
        <ConversationsClient conversations={vms} />
      </div>
    </>
  );
}
