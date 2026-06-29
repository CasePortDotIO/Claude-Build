"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { Kbd } from "@/components/ui/Kbd";

/**
 * Global ⌘K / Ctrl+K command palette — instant fuzzy navigation + key actions,
 * the power-user fast path. Opens on the keyboard shortcut or a "warmsweep:command"
 * window event (dispatched by the sidebar's Quick-find button), so it's both
 * discoverable and fast. Renders nothing until opened.
 */
interface Cmd {
  label: string;
  group: "Go to" | "Actions";
  keywords?: string;
  run: () => void;
}

export function CommandPalette({ isAgencyAdmin = false }: { isAgencyAdmin?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = useMemo<Cmd[]>(() => {
    const go = (label: string, href: string, keywords?: string): Cmd => ({ label, group: "Go to", keywords, run: () => router.push(href) });
    return [
      go("Command Center", "/", "home dashboard overview"),
      go("Leads", "/leads", "contacts list"),
      go("Approvals", "/approvals", "drafts review approve"),
      go("Conversations", "/conversations", "inbox replies threads"),
      go("The Agent", "/agent", "voice profile self improvement"),
      go("Connections", "/connections", "email calendar mailbox autopilot setup"),
      go("Deliverability", "/deliverability", "caps warmup suppression"),
      go("Account", "/account", "billing subscription cancel"),
      ...(isAgencyAdmin ? [go("Clients", "/clients", "reseller agency white label")] : []),
      { label: "New sweep — import leads", group: "Actions", keywords: "csv upload import start", run: () => router.push("/leads/import") },
      { label: "Log out", group: "Actions", keywords: "sign out logout exit", run: () => signOut({ callbackUrl: "/sign-in" }) },
    ];
  }, [router, isAgencyAdmin]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => `${c.label} ${c.keywords ?? ""}`.toLowerCase().includes(q));
  }, [commands, query]);

  // Open via ⌘K / Ctrl+K (toggle) or the sidebar Quick-find event.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("warmsweep:command", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("warmsweep:command", onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setIndex(0);
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open]);
  useEffect(() => setIndex(0), [query]);

  if (!open) return null;

  function activate(i: number) {
    const cmd = results[i];
    setOpen(false);
    cmd?.run();
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/40 px-4 pt-[12vh] backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command menu"
        className="ws-rise w-full max-w-[560px] overflow-hidden rounded-xl2 border border-line bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-line-2 px-4">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#9a958c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-none">
            <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setIndex((i) => Math.min(i + 1, results.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)); }
              else if (e.key === "Enter") { e.preventDefault(); activate(index); }
              else if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
            }}
            placeholder="Search pages and actions…"
            className="w-full bg-transparent py-3.5 text-[14.5px] text-ink outline-none placeholder:text-muted-3"
          />
          <span className="flex-none"><Kbd>ESC</Kbd></span>
        </div>

        <div className="ws-scroll max-h-[52vh] overflow-y-auto p-2">
          {results.length === 0 ? (
            <p className="m-0 px-3 py-6 text-center text-[13px] text-muted">No matches for “{query}”.</p>
          ) : (
            results.map((c, i) => {
              const showGroup = i === 0 || results[i - 1].group !== c.group;
              return (
                <Fragment key={`${c.group}:${c.label}`}>
                  {showGroup && (
                    <p className="m-0 px-3 pb-1 pt-2.5 text-[10.5px] font-semibold uppercase tracking-[1px] text-muted-3">{c.group}</p>
                  )}
                  <button
                    onClick={() => activate(i)}
                    onMouseMove={() => setIndex(i)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13.5px] ${
                      i === index ? "bg-cream text-ink" : "text-ink-soft"
                    }`}
                  >
                    <span className="flex-1">{c.label}</span>
                    {i === index && <span className="text-[11px] text-muted-3">↵</span>}
                  </button>
                </Fragment>
              );
            })
          )}
        </div>

        <div className="flex items-center gap-4 border-t border-line-2 px-4 py-2 text-[11px] text-muted-3">
          <span className="flex items-center gap-1"><Kbd>↑↓</Kbd> navigate</span>
          <span className="flex items-center gap-1"><Kbd>↵</Kbd> open</span>
          <span className="ml-auto flex items-center gap-1"><Kbd>⌘K</Kbd> anytime</span>
        </div>
      </div>
    </div>
  );
}
