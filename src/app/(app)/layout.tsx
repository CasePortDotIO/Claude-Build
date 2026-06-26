import { requireOrg } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { Sidebar } from "@/components/nav/Sidebar";

// The authenticated app shell. requireOrg() redirects to /sign-in if there's
// no active org, so every page under (app) is guaranteed an org context.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireOrg();
  const org = await prisma.org.findUnique({ where: { id: ctx.orgId }, select: { name: true } });

  return (
    <div className="flex min-h-screen w-full bg-parchment text-ink">
      <Sidebar userName={ctx.name ?? ctx.email} orgName={org?.name ?? "Workspace"} />
      <main className="ws-scroll flex min-w-0 flex-1 flex-col">{children}</main>
    </div>
  );
}
