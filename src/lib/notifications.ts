/**
 * In-app notification creation (C5). This is a plain server-side helper — NOT a
 * "use server" action — so it can be called from agent flows / cron without
 * being exposed as a client-callable endpoint.
 *
 * Creating a notification is always best-effort: a failure here must never break
 * the core flow that triggered it (a reply landing, a booking, a send). So every
 * write is wrapped and swallowed with a log.
 */
import { prisma } from "@/lib/prisma";
import type { NotificationKind } from "@prisma/client";

export interface NotifyInput {
  orgId: string;
  kind: NotificationKind;
  title: string;
  body?: string | null;
  actionUrl?: string | null;
  userId?: string | null;
}

export async function createNotification(input: NotifyInput): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        orgId: input.orgId,
        userId: input.userId ?? null,
        kind: input.kind,
        title: input.title,
        body: input.body ?? null,
        actionUrl: input.actionUrl ?? null,
      },
    });
  } catch (err) {
    // Never let a notification failure surface to the triggering flow.
    console.error(`[notifications] create failed (${input.kind}):`, err);
  }
}
