"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOrg } from "@/lib/auth-helpers";

/**
 * Notification center server actions (C5). All scope to the caller's active org
 * via requireOrg() — the client never passes an orgId, so one workspace can't
 * read or mutate another's notifications.
 */

export interface NotificationVM {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  actionUrl: string | null;
  unread: boolean;
  createdAt: string; // ISO
}

export interface NotificationsResult {
  unread: number;
  items: NotificationVM[];
}

/** Recent notifications for the active org + the current unread count. */
export async function listNotificationsAction(): Promise<NotificationsResult> {
  const ctx = await requireOrg();
  const [rows, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { orgId: ctx.orgId },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.notification.count({ where: { orgId: ctx.orgId, status: "UNREAD" } }),
  ]);
  return {
    unread,
    items: rows.map((n) => ({
      id: n.id,
      kind: n.kind,
      title: n.title,
      body: n.body,
      actionUrl: n.actionUrl,
      unread: n.status === "UNREAD",
      createdAt: n.createdAt.toISOString(),
    })),
  };
}

/** Lightweight unread count for the bell badge (polled). */
export async function unreadCountAction(): Promise<number> {
  const ctx = await requireOrg();
  return prisma.notification.count({ where: { orgId: ctx.orgId, status: "UNREAD" } });
}

/** Mark a single notification read (scoped to the active org). */
export async function markNotificationReadAction(id: string): Promise<{ ok: boolean }> {
  const ctx = await requireOrg();
  await prisma.notification.updateMany({
    where: { id, orgId: ctx.orgId, status: "UNREAD" },
    data: { status: "READ", readAt: new Date() },
  });
  revalidatePath("/");
  return { ok: true };
}

/** Mark every unread notification in the active org read. */
export async function markAllNotificationsReadAction(): Promise<{ ok: boolean }> {
  const ctx = await requireOrg();
  await prisma.notification.updateMany({
    where: { orgId: ctx.orgId, status: "UNREAD" },
    data: { status: "READ", readAt: new Date() },
  });
  revalidatePath("/");
  return { ok: true };
}
