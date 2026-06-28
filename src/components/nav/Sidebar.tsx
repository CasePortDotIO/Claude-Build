"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { switchOrgAction } from "@/server/actions/org";
import type { Branding } from "@/lib/branding";

/**
 * The dark left rail from the mockup. White-labeled brand block, an org switcher
 * (for users in multiple workspaces / agency admins), nav, and a user footer.
 * The Clients (reseller) item only appears for agency admins.
 */

type NavSection = "workspace" | "setup" | "agency";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  section: NavSection;
  badgeKey?: "pendingDrafts" | "needsReview";
  reseller?: boolean;
}

// Section order + headers. "workspace" (daily work) leads with no label; setup
// and agency are quieter, clearly separated so config never crowds daily flow.
const SECTIONS: { key: NavSection; label: string | null }[] = [
  { key: "workspace", label: null },
  { key: "setup", label: "Setup" },
  { key: "agency", label: "Agency" },
];

interface MembershipVM {
  orgId: string;
  name: string;
  role: string;
  type: string;
}

const ICON = (path: React.ReactNode) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {path}
  </svg>
);

const NAV: NavItem[] = [
  { section: "workspace", href: "/", label: "Command Center", icon: ICON(<><rect x="3" y="3" width="7" height="9" /><rect x="14" y="3" width="7" height="5" /><rect x="14" y="12" width="7" height="9" /><rect x="3" y="16" width="7" height="5" /></>) },
  { section: "workspace", href: "/leads", label: "Leads", icon: ICON(<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>) },
  { section: "workspace", href: "/approvals", label: "Approvals", badgeKey: "pendingDrafts", icon: ICON(<><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="M22 4L12 14.01l-3-3" /></>) },
  { section: "workspace", href: "/conversations", label: "Conversations", badgeKey: "needsReview", icon: ICON(<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />) },
  { section: "setup", href: "/agent", label: "The Agent", icon: ICON(<><path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8" /><circle cx="12" cy="12" r="3.2" /></>) },
  { section: "setup", href: "/connections", label: "Connections", icon: ICON(<path d="M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 0 1 0 10h-2M8 12h8" />) },
  { section: "setup", href: "/deliverability", label: "Deliverability", icon: ICON(<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />) },
  { section: "agency", href: "/clients", label: "Clients", reseller: true, icon: ICON(<path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-3" />) },
];

export function Sidebar({
  userName,
  orgName,
  badges,
  branding,
  memberships = [],
  activeOrgId,
  isAgencyAdmin = false,
}: {
  userName: string;
  orgName: string;
  badges?: { pendingDrafts?: number; needsReview?: number };
  branding: Branding;
  memberships?: MembershipVM[];
  activeOrgId: string;
  isAgencyAdmin?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [switching, startSwitch] = useTransition();

  function switchTo(orgId: string) {
    if (orgId === activeOrgId) return setSwitcherOpen(false);
    startSwitch(async () => {
      const r = await switchOrgAction(orgId);
      setSwitcherOpen(false);
      if (r.ok) {
        router.push("/");
        router.refresh();
      }
    });
  }
  const nav = NAV.filter((item) => !item.reseller || isAgencyAdmin);
  const initials = userName
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <>
      {/* Mobile hamburger — opens the drawer (hidden on lg+). */}
      <button
        onClick={() => setMobileOpen(true)}
        aria-label="Open menu"
        className="fixed left-3 top-3 z-50 flex h-10 w-10 items-center justify-center rounded-lg bg-charcoal text-white shadow-lg lg:hidden"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
      </button>
      {/* Backdrop when the drawer is open on mobile. */}
      {mobileOpen && <div onClick={() => setMobileOpen(false)} className="fixed inset-0 z-40 bg-black/50 lg:hidden" />}

      <aside
        className={`ws-scroll fixed inset-y-0 left-0 z-50 flex h-screen w-[248px] flex-none flex-col overflow-y-auto bg-charcoal transition-transform duration-200 lg:sticky lg:top-0 lg:z-auto lg:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
      <div className="relative border-b border-charcoal-line px-[22px] pb-[18px] pt-6">
        <p className="m-0 mb-[3px] font-heading text-[15px] font-semibold tracking-[-0.2px]" style={{ color: branding.color }}>
          {branding.tagline}
        </p>
        <p className="m-0 mb-[7px] truncate text-[12px] tracking-[0.3px] text-on-dark-mute">{branding.name}</p>
        {branding.poweredBy && <p className="m-0 truncate text-[10.5px] tracking-[0.3px] text-[#5a6066]">{branding.poweredBy}</p>}

        {/* org switcher — only when the user belongs to more than one workspace */}
        {memberships.length > 1 && (
          <div className="mt-3">
            <button
              disabled={switching}
              onClick={() => setSwitcherOpen((v) => !v)}
              className="flex w-full items-center justify-between rounded-lg bg-charcoal-soft px-3 py-2 text-[12.5px] font-medium text-on-dark hover:bg-[#2c3137] disabled:opacity-60"
            >
              <span className="truncate">{switching ? "Switching…" : orgName}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 9l4-4 4 4M16 15l-4 4-4-4" /></svg>
            </button>
            {switcherOpen && (
              <div className="absolute left-[22px] right-[22px] z-50 mt-1 overflow-hidden rounded-lg border border-charcoal-line bg-[#1d2125] shadow-xl">
                {memberships.map((m) => (
                  <button
                    key={m.orgId}
                    disabled={switching}
                    onClick={() => switchTo(m.orgId)}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-[12.5px] hover:bg-charcoal-soft disabled:opacity-60 ${m.orgId === activeOrgId ? "text-white" : "text-on-dark-soft"}`}
                  >
                    <span className="truncate">{m.name}</span>
                    <span className="ml-2 flex-none rounded bg-charcoal px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-on-dark-mute">
                      {m.type === "AGENCY" ? "agency" : m.role.replace("CLIENT_", "").replace("_", " ").toLowerCase()}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <nav className="flex flex-1 flex-col gap-1 p-3">
        {/* Quick find — opens the ⌘K command palette (also bound globally). */}
        <button
          onClick={() => window.dispatchEvent(new Event("warmsweep:command"))}
          className="mb-2 flex items-center gap-2.5 rounded-lg border border-charcoal-line bg-charcoal-soft px-3 py-2 text-[12.5px] text-on-dark-mute transition-colors hover:text-on-dark"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
          </svg>
          <span>Quick find</span>
          <kbd className="ml-auto rounded border border-[#34393f] px-1.5 py-0.5 text-[9.5px] font-semibold tracking-wide">⌘K</kbd>
        </button>
        {SECTIONS.map((sec) => {
          const items = nav.filter((i) => i.section === sec.key);
          if (items.length === 0) return null;
          return (
            <div key={sec.key} className={sec.label ? "mt-4" : undefined}>
              {sec.label && (
                <p className="m-0 mb-1 px-3 text-[10px] font-semibold uppercase tracking-[1.4px] text-on-dark-mute">
                  {sec.label}
                </p>
              )}
              <div className="flex flex-col gap-[3px]">
                {items.map((item) => {
                  const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                  const badgeCount = item.badgeKey ? badges?.[item.badgeKey] ?? 0 : 0;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
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
                    </Link>
                  );
                })}
              </div>
            </div>
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
          <Link
            href="/account"
            title="Account"
            onClick={() => setMobileOpen(false)}
            className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-lg bg-charcoal-soft text-on-dark-soft hover:bg-[#2c3137]"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </Link>
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
    </>
  );
}
