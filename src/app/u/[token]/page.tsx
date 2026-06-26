import { prisma } from "@/lib/prisma";
import { verifyUnsubscribeToken } from "@/lib/compliance/unsubscribe";

/**
 * Public one-click unsubscribe (§9) — no login. Honors the opt-out instantly and
 * permanently: adds the email to the org suppression list, flips any matching
 * lead to OPTED_OUT, and closes the conversation. Idempotent and safe to re-hit
 * (Gmail's one-click prefetch may call it more than once).
 */
export default async function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const decoded = verifyUnsubscribeToken(token);

  let ok = false;
  if (decoded) {
    const { orgId, email } = decoded;
    await prisma.$transaction(async (tx) => {
      await tx.suppressionEntry.upsert({
        where: { orgId_email: { orgId, email } },
        create: { orgId, email, reason: "OPTED_OUT", note: "one-click unsubscribe" },
        update: { reason: "OPTED_OUT" },
      });
      const lead = await tx.lead.findFirst({ where: { orgId, email } });
      if (lead && lead.status !== "OPTED_OUT") {
        await tx.lead.update({ where: { id: lead.id }, data: { status: "OPTED_OUT" } });
        await tx.conversation.updateMany({ where: { orgId, leadId: lead.id }, data: { status: "CLOSED" } });
      }
      await tx.auditLog.create({ data: { orgId, action: "lead.unsubscribe", targetType: "Lead", metadata: { email } } });
    });
    ok = true;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-parchment px-6">
      <div className="w-full max-w-[440px] rounded-2xl border border-line bg-white p-8 text-center">
        {ok ? (
          <>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-sweep-mist">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1B7A57" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
            <h1 className="m-0 mb-2 font-heading text-[22px] font-semibold text-ink">You&apos;re unsubscribed</h1>
            <p className="m-0 text-[14px] leading-[1.6] text-muted">
              You won&apos;t receive any more emails from us. This takes effect immediately and permanently — no
              further action needed.
            </p>
          </>
        ) : (
          <>
            <h1 className="m-0 mb-2 font-heading text-[22px] font-semibold text-ink">Link not valid</h1>
            <p className="m-0 text-[14px] text-muted">
              This unsubscribe link is invalid or expired. If you keep receiving emails, reply with “stop” and
              we&apos;ll remove you.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
