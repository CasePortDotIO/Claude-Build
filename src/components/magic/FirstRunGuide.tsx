import Link from "next/link";
import type { FirstRunState } from "@/lib/metrics";
import { TrustStrip } from "@/components/magic/TrustStrip";

/**
 * The guided first sweep (M9). A brand-new coach shouldn't land on an empty
 * dashboard and have to assemble the magic across five nav items — so until they
 * take one lead all the way to a send, we hand them the path: connect → import →
 * draft → approve. Each step lights up green as the real data appears, and the
 * next action is always the obvious next click.
 */

interface StepDef {
  key: keyof Pick<FirstRunState, "mailboxConnected" | "leadsImported" | "draftsGenerated" | "firstSent">;
  title: string;
  blurb: string;
  href: string;
  cta: string;
}

const STEPS: StepDef[] = [
  {
    key: "mailboxConnected",
    title: "Connect your mailbox",
    blurb: "The agent sends from your inbox, in your name. No account handy? Use the simulated mailbox to see the whole loop offline.",
    href: "/connections",
    cta: "Connect a mailbox",
  },
  {
    key: "leadsImported",
    title: "Bring in your dormant leads",
    blurb: "Upload a CSV of people who once inquired and went cold. We'll show you the pipeline that's been sitting there.",
    href: "/leads/import",
    cta: "Start a sweep",
  },
  {
    key: "draftsGenerated",
    title: "Let the agent draft",
    blurb: "It reads each lead's history and writes a re-engagement email in your voice — grounded in real memory, never made up.",
    href: "/leads",
    cta: "Generate drafts",
  },
  {
    key: "firstSent",
    title: "Approve & send your first",
    blurb: "Review, tweak if you like, and approve. Nothing leaves your mailbox without your click.",
    href: "/approvals",
    cta: "Review approvals",
  },
];

export function FirstRunGuide({ state, operatorName }: { state: FirstRunState; operatorName: string }) {
  const doneCount = STEPS.filter((s) => state[s.key]).length;
  // The next actionable step is the first one not yet done.
  const nextIdx = STEPS.findIndex((s) => !state[s.key]);

  return (
    <div className="mb-[22px]">
      <div className="overflow-hidden rounded-xl2 border border-line bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-2 bg-charcoal px-6 py-5">
          <div>
            <p className="m-0 font-heading text-[19px] font-semibold tracking-[-0.3px] text-white">
              Welcome{operatorName ? `, ${operatorName.split(" ")[0]}` : ""} — let&apos;s run your first sweep
            </p>
            <p className="m-0 mt-1 text-[13px] text-on-dark-soft">
              Four steps to your first re-engaged lead. Most coaches finish in under five minutes.
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="h-2 w-28 overflow-hidden rounded-full bg-charcoal-soft">
              <div className="h-full rounded-full bg-sweep-light transition-all" style={{ width: `${(doneCount / STEPS.length) * 100}%` }} />
            </div>
            <span className="font-mono text-[12px] text-on-dark-soft">{doneCount}/{STEPS.length}</span>
          </div>
        </div>

        <ol className="m-0 list-none p-0">
          {STEPS.map((s, i) => {
            const done = state[s.key];
            const isNext = i === nextIdx;
            return (
              <li
                key={s.key}
                className={`flex flex-wrap items-center gap-4 border-b border-line-2 px-6 py-4 last:border-b-0 ${
                  isNext ? "bg-sweep-mist/40" : ""
                }`}
              >
                <span
                  className={`flex h-8 w-8 flex-none items-center justify-center rounded-full text-[13px] font-semibold ${
                    done ? "bg-sweep text-white" : isNext ? "bg-ember text-white" : "bg-cream text-muted-3"
                  }`}
                >
                  {done ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                  ) : (
                    i + 1
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`m-0 text-[14.5px] font-semibold ${done ? "text-muted-2 line-through" : "text-ink"}`}>{s.title}</p>
                  {!done && <p className="m-0 mt-0.5 max-w-[560px] text-[12.5px] leading-[1.5] text-muted-2">{s.blurb}</p>}
                </div>
                {!done && (
                  <Link
                    href={s.href}
                    className={`flex-none rounded-lg px-4 py-2 text-[13px] font-semibold ${
                      isNext ? "bg-ember text-white hover:bg-ember-hover" : "border border-line-3 bg-white text-muted hover:bg-cream"
                    }`}
                  >
                    {s.cta} →
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </div>

      <TrustStrip className="mt-4" />
    </div>
  );
}
