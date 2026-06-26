import { LEAD_STATUS_META } from "@/lib/types";
import type { LeadStatus } from "@prisma/client";

const TONE_CLASS: Record<string, string> = {
  neutral: "bg-line-2 text-muted",
  active: "bg-[rgba(232,116,59,0.1)] text-ember",
  good: "bg-[rgba(27,122,87,0.1)] text-sweep",
  dead: "bg-[rgba(180,60,60,0.08)] text-[#b43c3c]",
};

export function StatusBadge({ status }: { status: LeadStatus }) {
  const meta = LEAD_STATUS_META[status];
  return (
    <span
      className={`inline-block rounded-md px-2.5 py-1 text-xs font-semibold ${TONE_CLASS[meta.tone]}`}
    >
      {meta.label}
    </span>
  );
}
