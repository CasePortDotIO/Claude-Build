import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { assertRole } from "@/lib/roles";
import type { Role } from "@prisma/client";

export { assertRole };

export interface ActiveContext {
  userId: string;
  orgId: string;
  role: Role;
  email: string;
  name: string | null;
}

/**
 * Resolve the signed-in user + active org, or redirect to sign-in.
 * Every protected server component / action funnels through this so we never
 * operate without an authenticated, org-scoped context.
 */
export async function requireOrg(): Promise<ActiveContext> {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || !user.activeOrgId) {
    redirect("/sign-in");
  }
  return {
    userId: user.id,
    orgId: user.activeOrgId,
    role: (user.activeRole as Role) ?? "MEMBER",
    email: user.email ?? "",
    name: user.name ?? null,
  };
}
