import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyUnsubscribeToken } from "@/lib/compliance/unsubscribe";

/**
 * RFC 8058 one-click unsubscribe target (POST). Gmail/Outlook POST here when the
 * recipient hits the native "Unsubscribe" button, driven by the
 * List-Unsubscribe + List-Unsubscribe-Post headers we set on send. Same effect
 * as the page: suppress + opt-out, idempotently.
 */
async function honor(token: string) {
  const decoded = verifyUnsubscribeToken(token);
  if (!decoded) return false;
  const { orgId, email } = decoded;
  await prisma.$transaction(async (tx) => {
    await tx.suppressionEntry.upsert({
      where: { orgId_email: { orgId, email } },
      create: { orgId, email, reason: "OPTED_OUT", note: "list-unsubscribe one-click" },
      update: { reason: "OPTED_OUT" },
    });
    const lead = await tx.lead.findFirst({ where: { orgId, email } });
    if (lead && lead.status !== "OPTED_OUT") {
      await tx.lead.update({ where: { id: lead.id }, data: { status: "OPTED_OUT" } });
      await tx.conversation.updateMany({ where: { orgId, leadId: lead.id }, data: { status: "CLOSED" } });
    }
    await tx.auditLog.create({ data: { orgId, action: "lead.unsubscribe", targetType: "Lead", metadata: { email, via: "one-click" } } });
  });
  return true;
}

export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ok = await honor(token);
  return NextResponse.json({ ok }, { status: ok ? 200 : 400 });
}
