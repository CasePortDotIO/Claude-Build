import Link from "next/link";
import { NotificationBell } from "@/components/nav/NotificationBell";
import { listNotificationsAction } from "@/server/actions/notifications";

/**
 * Sticky page header: title (+ optional subtitle that says what the page is for),
 * the agent status pill, and a contextual primary action. The action defaults to
 * "New sweep" (the global create action); pass `action={null}` to hide it on
 * pages where it would be redundant (e.g. the import flow itself).
 */
interface TopbarAction {
  label: string;
  href: string;
}

export async function Topbar({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: TopbarAction | null;
}) {
  const cta = action === null ? null : action ?? { label: "New sweep", href: "/leads/import" };
  const notifications = await listNotificationsAction();

  return (
    <header className="sticky top-0 z-30 flex h-[66px] items-center justify-between gap-3 border-b border-[#e7e1d6] bg-[rgba(250,247,242,0.86)] px-4 pl-16 backdrop-blur-md sm:gap-5 lg:px-[34px]">
      <div className="min-w-0">
        <h1 className="m-0 truncate font-heading text-[18px] font-semibold tracking-[-0.3px] text-ink sm:text-[20px]">{title}</h1>
        {subtitle && <p className="m-0 hidden truncate text-[12.5px] text-muted-2 sm:block">{subtitle}</p>}
      </div>
      <div className="flex flex-none items-center gap-3.5">
        <NotificationBell initial={notifications} />
        <span className="hidden items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-[12.5px] sm:flex">
          <span className="inline-block h-2 w-2 animate-wsPulse rounded-full bg-sweep" />
          <span className="font-semibold text-sweep">Active</span>
          <span className="text-[#888780]">preview &amp; approve</span>
        </span>
        {cta && (
          <Link
            href={cta.href}
            className="flex items-center gap-2 rounded-lg bg-ember px-4 py-2.5 font-heading text-[13.5px] font-semibold text-white hover:bg-ember-hover"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            {cta.label}
          </Link>
        )}
      </div>
    </header>
  );
}
