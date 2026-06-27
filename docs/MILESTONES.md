# Build plan & milestone tracker

The Warm Sweep ships in runnable slices. v1 (acceptance) = M1–M5.

- [x] **M1 — Foundation.** Schema + auth + multi-tenant org model + CSV import + lead table UI.
- [x] **M2 — Memory & drafting.** Voice profile + memory tables/pgvector + Claude draft engine + Approval queue (render email, no real send).
- [x] **M3 — Send loop.** Gmail OAuth send + reply detection + agent state machine + Conversations UI.
- [x] **M4 — Booking & KPIs.** Cal.com booking + booking detection + Command Center KPIs/activity feed.
- [x] **M5 — Compliance & deliverability.** Opt-out, suppression enforcement, caps, warmup + Deliverability view. **← v1 (M1–M5) acceptance complete.**
- [x] **M6 — Self-improvement.** Nightly reflection job + "what it taught itself" log + A/B holdout.
- [x] **M7 — More integrations.** Microsoft Graph + Calendly + HubSpot/Sheets/Mailchimp/Kajabi importers.
- [x] **M8 — Reseller/white-label.** Agency roll-up + per-client branding + per-seat billing fields. **← all 8 milestones complete.**

## Confirmed stack decisions
- Inngest for jobs/scheduling (serverless-native; matches Vercel). BullMQ+Redis only if self-host is required.
- pgvector in the same Postgres (transactional isolation + easy export/delete). No external vector DB.
- Voyage AI for embeddings behind an `Embedder` interface (Anthropic has no embeddings endpoint). Claude for all reasoning/copy.
- OAuth tokens encrypted at rest (AES-256-GCM, `src/lib/crypto.ts`).

## Hard rails (never regress)
- No irreversible action (send/book) without approval in v1; gate every one.
- Per-org isolation via `orgScoped()` — the tenancy test must stay green.
- Prior-contact gate on import; suppression + caps honored even when "autonomous".
- Anthropic key + OAuth secrets server-side only.

## M1 file map (built)
- `prisma/schema.prisma`, `prisma/seed.ts` — tenancy + leads + compliance tables.
- `src/lib/tenancy.ts` — org-scoping choke point.
- `src/lib/crypto.ts` — token encryption (used M3).
- `src/lib/auth.ts`, `auth-helpers.ts`, `middleware.ts` — Auth.js + route guard.
- `src/lib/import/{csv,mapping,prior-contact-gate}.ts` — import pipeline.
- `src/server/actions/{auth,import}.ts` — server actions.
- `src/app/(app)/**` — shell, Command Center, Leads, import wizard.
- `src/app/(auth)/**` — sign-in/up.
- Tests: mapping, prior-contact-gate, tenancy (isolation), import.

## M2 file map (built)
- `prisma/schema.prisma` — VoiceProfile, VoiceSample, MemoryEmbedding (pgvector `vector(1024)` + HNSW cosine index), Draft, DraftVariant, AgentRun.
- `src/lib/ai/config.ts` — provider config + cost table; runs with or without API keys.
- `src/lib/ai/embedder.ts` — `Embedder` (VoyageEmbedder real, HashEmbedder deterministic local).
- `src/lib/memory.ts` — store/retrieve over pgvector; raw SQL, **orgId required on every call**.
- `src/lib/ai/{types,prompts,anthropic,provider}.ts` — `LLMProvider` (Anthropic forced tool-use + StubProvider), draft + voice engines.
- `src/lib/agent/{voice,draft}.ts` — orchestrators: learn voice; generate drafts (memory-grounded, guards opt-out/suppression, logs AgentRun, advances lead state).
- `src/server/actions/agent.ts` — learn/edit voice, generate drafts, approve/reject/approve-all.
- `src/app/(app)/{agent,approvals}/**`, `components/{agent,approvals}/**`, Leads drawer drafts.
- Tests: embedder determinism + cosine ranking; memory retrieval + per-org isolation; stub draft shape + grounding (no invented facts); draft guard rails (opt-out/suppression) + state transitions.

### M2 notes / what's stubbed
- **No API keys required to run.** Without `ANTHROPIC_API_KEY` the StubProvider writes real, memory-grounded copy; without `VOYAGE_API_KEY` the HashEmbedder gives deterministic, overlap-sensitive embeddings. Set the keys to switch to Claude + Voyage with zero code changes.
- **Nothing sends.** Approval sets the lead to `SCHEDULED`; the actual Gmail send + reply detection is M3.
- pgvector must be enabled (the M2 migration runs `CREATE EXTENSION IF NOT EXISTS vector`).

## M3 file map (built)
- `prisma/schema.prisma` — Mailbox (encrypted tokens, caps), Message (direction, threadId, auto-reply/bounce/opt-out flags), Conversation (per-lead thread, autopilot).
- `src/lib/mailbox/{types,gmail,simulation,index}.ts` — `MailboxProvider` adapter; GmailProvider (Gmail API + OAuth) and SimulationProvider (offline); inbound classifier; token decryption.
- `src/lib/agent/state-machine.ts` — explicit lead transition table + guards (`transition`, `canTransition`, terminal states).
- `src/lib/agent/send.ts` — `sendApprovedDraft`/`sendAllApproved`: send via mailbox, open conversation, advance state, respect daily cap, refuse suppressed/terminal.
- `src/lib/agent/inbound.ts` — `ingestInboundEmail`: classify, match (sender → thread fallback), advance; genuine reply → drafts a response (queued for approval); opt-out/bounce → suppress + terminal.
- `src/lib/ai/{types,prompts,provider}.ts` — added `draftReply` (real + stub).
- `src/server/actions/mailbox.ts` — connect simulation mailbox, send, simulate reply, sync Gmail.
- `src/app/api/connections/gmail/{start,callback}` — OAuth flow; tokens encrypted at rest.
- `src/app/(app)/{conversations,connections}/**`, components for both + Approvals "ready to send".
- Tests: state-machine (legal/illegal/terminal/opt-out), send + reply loop (send, positive reply → NEGOTIATING + reply draft, opt-out → suppress, bounce via thread match, suppressed refused), inbound classifier.

### M3 notes / what's stubbed
- **Runs fully offline.** A SIMULATION mailbox sends without Google and inbound replies are injected via "Simulate reply" (positive / opt-out / bounce). Set `GOOGLE_CLIENT_ID`/`SECRET` to connect a real Gmail mailbox (tokens AES-256-GCM encrypted at rest); reply sync via the Gmail API.
- **Approval still gates every send** (v1 default). Reply drafts also land in the approval queue; the per-conversation `autopilot` flag exists for the future autonomous path.
- Daily send caps are respected here; full warmup/throttling + deliverability view are **M5**.

## M4 file map (built)
- `prisma/schema.prisma` — CalendarConnection (encrypted key, eventTypeId, bookingLink), Booking (slot, attendee, providerEventId, valueCents, source), Lead.dealValueCents, Org.slackWebhookEnc.
- `src/lib/calendar/{types,slots,simulation,calcom,index}.ts` — `CalendarProvider` adapter; Cal.com (API v2) + Simulation + LINK fallback; deterministic business-hour slot generator.
- `src/lib/agent/booking.ts` — `bookCall` (create event, Booking, lead→BOOKED, conversation→BOOKED, value snapshot, notify), `availabilityLabels`.
- `src/lib/notify.ts` — Slack webhook + audit notifier, fired on booking.
- `src/lib/metrics.ts` — Command Center KPIs (recovered revenue, calls booked, reply rate, active convos), 7-day reactivations chart, unified activity feed.
- `src/server/actions/calendar.ts` — connect Cal.com/simulated calendar, booking link, Slack webhook, get availability, book a call.
- `src/app/api/webhooks/calcom/route.ts` — detect external bookings (match by attendee, dedupe on uid, capture slot).
- `src/app/(app)/page.tsx` (real Command Center), Conversations booking control + confirmation, Connections calendar/Slack cards.
- Tests: slot generation (future/weekday/format), booking pipeline (book→BOOKED + Booking + value + supersede draft, opt-out refused, double-book refused), KPI aggregation + org isolation.

### M4 notes / what's stubbed
- **Books the call, offline or live.** With a simulated calendar the agent offers real-shaped slots and books on click; set a Cal.com API key + event type for real bookings, or a booking link for the self-serve + webhook path. Calendly is stubbed for M7.
- **Notifications:** Slack webhook (encrypted) + an audit record on every booking. Email-on-booking reuses the mailbox in a later pass.
- The Command Center "agent updated itself" self-improvement card (metric-justified changes + A/B) is **M6**; today it surfaces the latest real agent activity and links to The Agent.

## M5 file map (built)
- `prisma/schema.prisma` — Mailbox warmup/caps/bounce fields (hourlyCap, sentTotal, bounceCount, complaintCount, warmupStartedAt, pausedReason); Org.slackWebhookEnc.
- `src/lib/compliance/unsubscribe.ts` — HMAC one-click unsubscribe tokens (sign/verify/url).
- `src/lib/compliance/index.ts` — `assertContactable` (single suppression/opt-out/DNC/terminal gate), CAN-SPAM footer (unsubscribe link + physical address).
- `src/lib/compliance/caps.ts` — warmup ramp + effective cap, bounce/complaint rates, auto-pause decision.
- `src/lib/compliance/gdpr.ts` — per-lead export + erasure (cascade + DO_NOT_CONTACT).
- `src/lib/compliance/deliverability.ts` — sender-health score (from real signals), SPF/DMARC DNS check, mailbox health.
- `src/app/u/[token]/page.tsx` + `src/app/api/unsubscribe/[token]/route.ts` — public one-click unsubscribe (GET page + RFC 8058 POST).
- `src/app/api/leads/[id]/export/route.ts` — GDPR JSON download.
- `src/server/actions/compliance.ts` — erase lead, suppress email, set mailing address, resume mailbox.
- send pipeline now: contactability gate, requires mailing address, appends footer, sets List-Unsubscribe header, enforces effective daily + hourly caps; inbound bounce/opt-out increment counters and auto-pause over threshold.
- `src/app/(app)/deliverability/**` — health gauge, inbox-placement estimate, auth checklist, mailbox caps/warmup, suppression list + manual suppress + resume; Leads drawer export/erase.
- Tests: unsubscribe token round-trip + footer idempotency, warmup/cap/auto-pause math, and a DB-backed flow (contactability gate, CAN-SPAM address required, footer appended, GDPR erasure, bounce-threshold auto-pause).

### M5 notes — v1 acceptance (M1–M5) is done
- Acceptance path works end-to-end: create org → import prior leads → agent drafts grounded copy → approve/edit → send from a mailbox → reply comes back and the thread auto-advances → call booked to the calendar → all on the Command Center — with opt-outs, suppression, CAN-SPAM, and caps enforced throughout.
- **Honest stubs:** DKIM can't be verified without the provider selector (shown as guidance); SPF/DMARC use a real DNS check when a sending domain is set, else guidance. Domain warmup uses a fixed ramp schedule. Inbox-placement is an estimate derived from the health score (no third-party seed-list test).

## M6 file map (built)
- `prisma/schema.prisma` — Insight (self-improvement log/proposals), OrgLearning (tuned settings), Lead.cohort (A/B).
- `src/lib/agent/rollups.ts` — outcome rollups (reply/booking rate by opener + by send-hour + by cohort), A/B lift, deterministic cohort assignment.
- `src/lib/agent/reflection.ts` — `runReflection` (bounded, metric-justified proposals — copy/timing only), `applyInsight`/`vetoInsight` (apply tunes OrgLearning + bumps version).
- draft engine now: assigns a stable A/B cohort (HOLDOUT gets a baseline opener), avoids retired phrases, and (real provider) is told the cohort + retired phrases.
- `src/server/actions/reflection.ts` — run reflection, apply, veto.
- `src/app/api/jobs/reflection/route.ts` — secret-protected cron endpoint (Vercel/Inngest nightly).
- `src/components/agent/SelfImprovement.tsx` + The Agent page — A/B holdout card, proposed changes (apply/veto), "what it taught itself" log, learned settings; Command Center "agent updated itself" wired to the latest applied insight.
- Tests: rollup math + A/B lift + cohort determinism; DB-backed reflection (proposes only allowed copy/timing kinds with metrics, no-dupe, apply→OrgLearning+version, retire→list, veto→VETOED).

### M6 notes / what's bounded
- **Improvement is measured, not asserted:** ~15% of leads are a deterministic HOLDOUT control with baseline copy; the A/B card shows treatment vs control reply rate + lift with sample sizes.
- **Guardrails:** reflection only ever proposes opener/send-time/follow-up changes (a closed enum) — never the sending identity or compliance logic (§8/§13). Nothing auto-applies; every change is operator apply/veto and logged with the justifying metric.
- **No opens:** there's no tracking pixel, so rollups measure replies + bookings (the outcomes that matter), not opens.
- The nightly job runs via the cron route in prod (Vercel Cron / Inngest); in the app there's a manual "Run reflection" trigger.

## M7 file map (built)
- `prisma/schema.prisma` — LeadSourceConnection (provider, encrypted key, config).
- `src/lib/import/ingest.ts` — shared `ingestLeads` pipeline (prior-contact gate + suppression/dup filter + audit) extracted from the CSV action; CSV + every source funnel through it.
- `src/lib/leadsource/{types,providers,sample,index}.ts` — `LeadSource` adapter; real HubSpot / Google Sheets / Mailchimp / Kajabi adapters + deterministic sample data + factory + `pullFromSource` (live if keyed, else sample).
- `src/lib/mailbox/microsoft.ts` — Microsoft Graph mailbox (OAuth, sendMail, fetch replies) wired into `getMailboxProvider(MICROSOFT)`; OAuth routes under `/api/connections/microsoft/*`.
- `src/lib/calendar/calendly.ts` — Calendly provider (availability + link-based booking via webhook) wired into `getCalendarProvider(CALENDLY)`.
- `src/server/actions/leadsource.ts` — connect/disconnect a source, import-from-source.
- `src/components/connections/LeadSourcesSection.tsx` + Connections page — connect cards (key form or sample) + Import; Microsoft 365 OAuth card; Calendly card.
- Tests: lead-source normalization + sample data + factory/liveness; DB-backed shared-ingest (gate refusal, sample import, suppression/dup filtering); M7 provider wiring (MS Graph auth URL + factory routing, Calendly empty-without-key).

### M7 notes / what's stubbed
- **Same gate for every source.** Whether leads come from CSV, HubSpot, Sheets, Mailchimp, or Kajabi, they pass through one `ingestLeads` path — prior-contact attestation, suppression + dedupe, audit. New sources can't bypass it.
- **Runs offline.** Connect a source with **no API key** → deterministic **sample** contacts so the import flow is demoable; add a key (+ config like list/sheet/subdomain id) to go live, zero code changes.
- **Microsoft 365** needs `MICROSOFT_CLIENT_ID/SECRET` (OAuth, tokens encrypted) — same pattern as Gmail. **Calendly** is scheduling-link-first: the agent offers slots and the invitee self-books (captured by the Cal.com-style webhook); direct server booking is link-based.

## M8 file map (built) — reseller / white-label

- `prisma/schema.prisma` — Org billing fields (clientPriceCents, seats, billingStatus); white-label fields (brandName/color/logo/fromDomain) were modeled in M1.
- `src/lib/branding.ts` — `resolveBranding`: a client's brand replaces "The Warm Sweep" for its users.
- `src/lib/agency.ts` — `agencyForUser` (authorization gate; works from any active org), `agencyRollup` (per-client recovered revenue/calls/reply-rate/margin, isolated to the agency's own clients).
- `src/lib/roles.ts` — pure role hierarchy + `assertRole` (extracted so it's test/Edge-safe).
- `src/lib/auth.ts` — JWT `update` handling for org switching, **membership re-verified** in the callback.
- `src/server/actions/org.ts` — switch org, create client, update client branding/billing, list memberships. Agency actions authorize via `agencyForUser`, not the active role.
- `src/components/nav/Sidebar.tsx` — white-labeled brand block + **org switcher** (multi-workspace users) + Clients nav gated to agency admins.
- `src/app/(app)/clients/**` — reseller roll-up (margin + per-client KPIs), add-client, per-client white-label/billing edit, "open workspace" drill-in. `generateMetadata` white-labels the browser tab too.
- Tests: agency roll-up aggregation + **cross-agency isolation** (one reseller never sees another's book), brand resolution, role hierarchy, agency authorization from any active org.

### M8 notes
- **Isolation holds through the reseller layer:** the roll-up only sums the agency's own clients; per-client memory, suppression, and metrics stay scoped. Verified live — Marco (a client user) is redirected from `/clients` and sees only his own brand.
- **White-label is real:** client users see their org's brand name + color in the shell and the browser title, "powered by [agency]" — never "The Warm Sweep". Default branding only shows for the product's own/unbranded workspaces.
- **Org switching** re-issues the session's active org but re-verifies membership server-side first; it can't be used to jump into a workspace you don't belong to.

## QA hardening pass (post-M8)

A full-codebase QA audit (agent loop + guardrails + UI wiring) ran after M8.
Verdict: tests/typecheck/build all green; zero dead buttons; 4/5 guardrails were
already enforced. Issues found and **fixed**:

- **[HIGH] Cross-tenant Cal.com webhook.** `/api/webhooks/calcom` matched a lead
  by bare email with no org scope and no signature → forged cross-tenant
  bookings. Fixed: the webhook URL now carries a **per-org signed token**
  (`src/lib/webhook-token.ts`); the route verifies it and scopes the lead lookup
  to that org, with optional `CAL_WEBHOOK_SECRET` HMAC body verification. The URL
  is surfaced in Connections. Verified live (no/forged token → 401; valid → 200,
  scoped).
- **[LOW] Booking skipped the suppression table.** `bookCall` checked lead status
  but not `SuppressionEntry`. Now routed through the same `assertContactable`
  gate as draft/send — one contactability gate everywhere.
- **[loop] 3 of 4 learned knobs were stored but never consumed.** Fixed:
  `promotedOpeners` now bias the draft engine (prompt + stub confidence);
  `followUpGapDays` + `bestSendHour` now drive a new **re-engagement sweep**
  (`src/lib/agent/maintenance.ts`) that dispatches the `COOL` event for leads
  silent past the gap and times their re-touch to the learned send hour —
  closing the silence/follow-up branch of the state machine (was never
  dispatched). Runs on the nightly cron + a manual "Run reflection" trigger.
- **[UI] Org switcher** had no pending/disabled state or error handling → added.
- **[UI] `?status=` filter** could 500 on an invalid value → now ignored.

Tests grew 90 → 97 (webhook token scoping, booking suppression gate, silence
sweep + best-hour timing, promoted-opener bias).

### Known honest limitations (documented, not bugs)
- Sends are **immediate on approval**; there is no deferred scheduler, so
  `bestSendHour` governs **re-engagement** timing (cooldown window) rather than
  first-touch send time. A production deferred-send queue (Inngest) would consume
  it for first sends too.
- The `orgScoped()` choke point wraps the core models; other tables use explicit
  `where: { orgId }` filters (all verified present). Broadening the wrapper is a
  good future hardening step.
- Guardrail "no invented facts" is prompt-enforced on the live-Claude path (the
  stub is fact-safe by construction) plus the human approval gate; there's no
  programmatic post-generation fact-checker yet.

---

## M9 — "The Magic": perceived value & the first-run wow

Top-0.01% isn't more backend — it's the first 60 seconds and the emotional
payoff. M9 makes the latent value *felt*, not assembled. Five surfaces, all
grounded in real data, all behind the existing guardrails.

### Schema (`m9_magic_dormant_value_voice_match`)
- `Org.avgClientValueCents` — what one client is worth; set once in the first
  sweep, remembered. Stamps every imported lead's `dealValueCents` at ingest so
  the dormant pipeline + recovered-revenue KPI are real, not decorative.
- `DraftVariant.voiceMatch` (0..1) + `voiceEcho` — voice fidelity made visible.

### 1 · Dormant-money reveal (`ImportWizard` done step)
The import wizard now asks "what's a client worth to you?" (optional). On import
it shows the wow: **"You just reconnected with N prior contacts sitting on
$X in dormant pipeline"** (animated count-up) + a conservative *"~$Y recoverable
at just a 5% reactivation rate"*. CTA flips from "View leads" to "Draft the
first emails →". Honest accounting stats (imported / dup / suppressed / bad)
sit below. `dormantPipelineCents = imported × avgClientValueCents`.

### 2 · Voice fidelity, shown not told (`lib/agent/voice-match.ts`)
Deterministic scorer (no extra LLM call): blends the model's confidence with
structural alignment to the learned voice (greeting / sign-off / sentence-length,
placeholder-aware) and a real **≥4-word phrase echoed from the operator's own
past emails**. Surfaced at approval: *"94% match to your voice · echoes your own
words: '…'"*. Computed in `draft.ts`, persisted per variant.

### 3 · Guided first sweep (`FirstRunGuide` on Command Center)
A brand-new coach gets a 4-step checklist (connect → import → draft → approve)
that lights up green from real data and always points at the next click —
instead of an empty dashboard. Hides itself once they've taken one lead all the
way to a send (`firstRunState`).

### 4 · Booking celebration (`BookingCelebration`)
When a cold lead books, the Command Center leads with the payoff:
**"🎉 {name} just booked a call — ${value} reactivated · from a lead that had
gone quiet for {N}d."** Shows once per booking (localStorage dismiss), only
while fresh (< 48h).

### 5 · Trust as confidence, early (`TrustStrip`)
"Nothing sends without you · keys never touch the browser · prior contacts only"
— surfaced on the import wizard and the first-run guide, where the fear lives.

Tests grew 97 → 105 (voice-match scoring + echo detection, dormant-value
stamping at ingest, voice-match persistence, first-run progress). Build clean,
all 105 green. Verified live with browser screenshots of every surface.

---

## M10 — Retention: switching cost, habit loop, ROI ledger

Churn is beaten by *accrued value the customer can see and would lose*, not by
lock-in. M10 surfaces the compounding assets the agent already builds. No new
schema — every input already accrues. (`lib/retention.ts`, pure org-scoped reads.)

### 1 · Agent Maturity score (`AgentMaturityCard`, The Agent page)
A 0–100 "trained" score with a conic ring + component bars: voice trained,
lead memory, self-improvement (insights applied × learning version), sender
reputation (days warmed), measured A/B lift. The number climbs only with use, so
it *is* the thing a coach resets to zero by leaving — switching cost made legible.

### 2 · ROI ledger (under the maturity card)
Cumulative recovered revenue, run-rate ($/mo), leads reactivated, days on the
job. The number that only grows; turning it off *feels* like loss.

### 3 · Morning Brief (`MorningBrief`, Command Center + Slack)
The habit loop. The nightly reflection run already produces the material; the
brief surfaces it as the first thing the operator sees each morning — drafted /
replied / booked, pipeline reactivated, what it learned, what needs their nod.
Collapses once per calendar day (greets, never nags). The nightly cron also
**pushes it to Slack** (`notifyMorningBrief`) — the external trigger that pulls
them back in daily. Hook model: trigger → one-click approve → variable reward
(who replied/booked) → investment (each approval makes tomorrow's agent better).

### Deliberately NOT done (anti-patterns)
No cancellation friction, export throttling, or guilt walls — off-brand for a
GDPR-respecting product and they raise gross churn. The moat is value, not walls.

Tests 105 → 109 (maturity scoring climbs with training, ledger sums confirmed
bookings, brief windows + pending). Build clean; both surfaces verified live.

### M10.1 · Morning Brief email digest (universal trigger)
The Slack push only reaches orgs with a webhook; the email digest reaches every
operator who connected a mailbox. `emailMorningBrief` (`lib/agent/digest.ts`)
sends a plain-text recap to each workspace member via the connected mailbox
provider. It's a **transactional self-notification**, so it deliberately bypasses
the lead-send compliance footer, suppression list, and daily caps — none apply to
emailing a coach their own recap. Idempotent per calendar day (audit-logged),
activity-gated (silent on quiet nights), best-effort (never throws into the
nightly job). Wired into the reflection cron next to the Slack push; the route
now reports `briefsEmailed`. Tests 109 → 113.
