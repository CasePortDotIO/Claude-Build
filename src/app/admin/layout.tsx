import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/auth-helpers";
import { isSuperadmin } from "@/lib/auth/superadmin";

/**
 * Platform admin area — gated to SUPERADMIN_EMAILS. Invisible (404) to everyone
 * else, including workspace admins. Standalone chrome (no app sidebar/paywall)
 * so a superadmin can operate the platform regardless of their own workspace's
 * billing state.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireOrg();
  if (!isSuperadmin(ctx.email)) notFound();
  return <div className="min-h-screen bg-parchment text-ink">{children}</div>;
}
