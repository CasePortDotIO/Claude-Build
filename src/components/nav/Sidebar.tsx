"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

/**
 * The dark left rail from the mockup. Brand block, nav, and a user footer.
 * Screens beyond Leads/Command Center are present but flagged "soon" — they
 * land in later milestones; the nav structure is locked now so it doesn't move.
 */

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  badgeKey?: "pendingDrafts" | "needsReview";
  reseller?: boolean;
  soon?: boolean;
}

const ICON = (path: React.ReactNode) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {path}
  </svg>
);

const NAV: NavItem[] = [
  { href: "/", label: "Command Center", icon: ICON(<><rect x="3" y="3" width="7" height="9" /><rect x="14" y="3" width="7" height="5" /><rect x="14" y="12" width="7" height="9" /><rect x="3" y="16" width="7" height="5" /></>) },
  { href: "/leads", label: "Leads", icon: ICON(<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>) },
  { href: "/approvals", label: "Approvals", badgeKey: "pendingDrafts", icon: ICON(<><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="M22 4L12 14.01l-3-3" /></>) },
  { href: "/conversations", label: "Conversations", badgeKey: "needsReview", icon: ICON(<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />) },
  { href: "/agent", label: "The Agent", icon: ICON(<><path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8" /><circle cx="12" cy="12" r="3.2" /></>) },
  { href: "/connections", label: "Connections", icon: ICON(<path d="M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 0 1 0 10h-2M8 12h8" />) },
  { href: "/deliverability", label: "Deliverability", soon: true, icon: ICON(<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />) },
  { href: "/clients", label: "Clients", reseller: true, soon: true, icon: ICON(<path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-3" />) },
];

export function Sidebar({
  userName,
  orgName,
  badges,
}: {
  userName: string;
  orgName: string;
  badges?: { pendingDrafts?: number; needsReview?: number };
}) {
  const pathname = usePathname();
  const initials = userName
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <aside className="ws-scroll sticky top-0 flex h-screen w-[248px] flex-none flex-col overflow-y-auto bg-charcoal">
      <div className="border-b border-charcoal-line px-[22px] pb-[22px] pt-6">
        <p className="m-0 mb-[3px] font-heading text-[15px] font-semibold tracking-[-0.2px] text-sweep-light">
          Coach. Don&apos;t Chase.
        </p>
        <p className="m-0 mb-[7px] text-[12px] tracking-[0.3px] text-on-dark-mute">The Warm Sweep™</p>
        <p className="m-0 text-[10.5px] tracking-[0.3px] text-[#5a6066]">by Delegate and Done</p>
      </div>

      <nav className="flex flex-1 flex-col gap-[3px] p-3">
        {NAV.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const badgeCount = item.badgeKey ? badges?.[item.badgeKey] ?? 0 : 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13.5px] font-medium transition-colors ${
                active ? "bg-charcoal-soft text-white" : "text-on-dark-soft hover:bg-[#1d2125] hover:text-white"
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
              {badgeCount > 0 && (
                <span className="ml-auto rounded-full bg-ember px-2 py-0.5 text-[10px] font-semibold text-white">
                  {badgeCount}
                </span>
              )}
              {item.reseller && (
                <span className="ml-auto rounded border border-[#34393f] px-[5px] py-0.5 text-[9px] font-semibold tracking-[0.8px] text-on-dark-mute">
                  RESELLER
                </span>
              )}
              {item.soon && !item.reseller && (
                <span className="ml-auto rounded bg-charcoal-soft px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.5px] text-on-dark-mute">
                  SOON
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-charcoal-line p-4">
        <div className="flex items-center gap-[11px]">
          <div className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full bg-avatar font-heading text-[14px] font-semibold text-white">
            {initials || "??"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="m-0 truncate text-[13px] font-semibold text-on-dark">{userName}</p>
            <p className="m-0 truncate text-[11.5px] text-on-dark-mute">{orgName}</p>
          </div>
          <button
            type="button"
            title="Log out"
            onClick={() => signOut({ callbackUrl: "/sign-in" })}
            className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-lg bg-charcoal-soft text-on-dark-soft hover:bg-[#2c3137]"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="M16 17l5-5-5-5M21 12H9" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}
