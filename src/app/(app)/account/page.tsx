import { requireOrg } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/nav/Topbar";
import { AccountClient } from "@/components/account/AccountClient";

export default async function AccountPage() {
  const ctx = await requireOrg();
  const org = await prisma.org.findUniqueOrThrow({
    where: { id: ctx.orgId },
    select: { name: true, brandName: true, billingStatus: true, canceledAt: true },
  });

  return (
    <>
      <Topbar title="Account" />
      <div className="ws-rise max-w-[760px] flex-1 px-[34px] pb-[60px] pt-[30px]">
        <AccountClient
          orgName={org.brandName || org.name}
          billingStatus={org.billingStatus}
          canceled={org.billingStatus === "canceled"}
        />
      </div>
    </>
  );
}
