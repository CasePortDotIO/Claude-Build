import { requireOrg } from "@/lib/auth-helpers";
import { Topbar } from "@/components/nav/Topbar";
import { ImportWizard } from "@/components/import/ImportWizard";

export default async function ImportPage() {
  await requireOrg(); // gate the route
  return (
    <>
      <Topbar title="New sweep" subtitle="Import prior contacts to revive" action={null} />
      <div className="ws-rise flex-1 px-[34px] pb-[60px] pt-[30px]">
        <p className="mb-6 max-w-[640px] text-[14px] leading-[1.6] text-muted">
          Upload a list of leads who previously inquired but went cold. The agent takes it from here — reading each
          thread, learning the goal, and drafting a re-engagement email for your approval.
        </p>
        <ImportWizard />
      </div>
    </>
  );
}
