# The Warm Sweep — *Coach. Don't Chase.*

An AI agent that revives cold leads: it reads prior email history, drafts
persuasive, personalized re-engagement emails **for your approval**, sends from
your own mailbox, detects replies, books calls, and reports results on a
dashboard — with persistent per-lead memory that improves copy and timing over
time.

> Multi-tenant SaaS · Next.js (App Router) + TypeScript · Postgres/Prisma ·
> Auth.js · Tailwind · Zod · Vitest. Built milestone by milestone.

---

## Status — v1 shipped ✅ + M6 self-improvement

**M1: Schema + auth + multi-tenant org model + CSV import + lead table UI.**
**M2: Voice profile + memory/pgvector + Claude draft engine + Approval queue.**
**M3: Mailbox send + reply detection + lead state machine + Conversations UI.**
**M4: Cal.com booking + booking detection + Command Center KPIs/activity feed.**
**M5: Compliance rails (opt-out, suppression, CAN-SPAM, caps, warmup) + Deliverability.**
**M6: Self-improvement — nightly reflection, "what it taught itself" log, A/B holdout.**

> **v1 acceptance:** create an org → import prior leads → the agent drafts a
> personalized re-engagement email grounded in real memory → approve/edit →
> send from your mailbox → a reply comes back and the thread auto-advances →
> a call is booked to your calendar → see it all on the Command Center — with
> opt-outs, suppression, and caps enforced the whole way.

What works right now, end-to-end:

- **Multi-tenant from day one.** An Agency (reseller) owns Client orgs; every
  tenant-owned row is `orgId`-scoped and only ever read through a single choke
  point (`src/lib/tenancy.ts`). Proven by live cross-tenant isolation tests
  (leads *and* semantic memory).
- **Auth** (Auth.js / NextAuth v5, credentials) with an org + role on the
  session. Sign-up atomically creates User → Org → Membership(CLIENT_ADMIN).
- **CSV import** with a real upload → **column-mapper** → preview → confirm flow,
  including the **prior-contact gate** (§9): reactivation only, never cold spam.
- **Two-layer memory.** Structured per-lead facts in Postgres + **semantic memory
  in pgvector** (`vector(1024)`, HNSW cosine index). Retrieval is org-isolated and
  injects the top-k voice samples + similar objections into every draft.
- **Voice profile** learned from past emails (tone, length, emoji, greeting,
  sign-off, signature move) — viewable and editable on **The Agent** page.
- **Claude draft engine** via forced **tool/JSON** calls: 2–3 grounded variants
  with confidence + rationale, "ask-don't-pitch" rules, a one-line opt-out in
  every email, and **personalization from real memory only — never invented**.
  Every call is logged to `agent_runs` (provider, model, tokens, cost, latency).
- **Approval queue** (v1 default = preview & approve): switch variants, edit,
  approve / reject / **approve-all**, then **send** from a connected mailbox.
- **Send loop (M3).** Approved drafts send from the operator's own mailbox; the
  agent opens a **Conversation**, watches for replies, **classifies** them
  (genuine / auto-reply / **bounce** / **opt-out**), and on a genuine reply
  drafts a response that goes back to the approval queue. An explicit **lead
  state machine** drives `NEW → … → SENT → AWAITING_REPLY → REPLIED →
  NEGOTIATING → BOOKED` with hard branches for bounce/opt-out.
- **Mailboxes.** Real **Gmail** via OAuth (tokens **AES-256-GCM encrypted at
  rest**) + a **simulation mailbox** that runs the whole send/reply loop offline.
- **Books the call (M4).** A **CalendarProvider** adapter (Cal.com API + a
  simulation calendar + a plain booking-link fallback) lets the agent offer
  **real availability** in its replies and **book the call** → lead `BOOKED`,
  with a Slack notification. A **Cal.com webhook** captures self-serve bookings.
- **Command Center, live.** Real KPIs — **recovered revenue**, calls booked,
  reply rate, active conversations — a 7-day reactivations chart, and a unified
  activity feed (sends / replies / bookings / agent runs).
- **Compliance as hard rails (M5).** One-click unsubscribe (signed token, public
  page + RFC 8058 one-click POST) honored instantly and permanently; a single
  **contactability gate** (suppression + opt-out + DNC) on every draft and send;
  **CAN-SPAM** footer (unsubscribe link + required physical address); **GDPR**
  per-lead export + erasure; **domain warmup** ramp + per-mailbox daily/hourly
  caps; **bounce/complaint auto-pause**. A **Deliverability** view shows a real
  sender-health score, SPF/DMARC checks, caps/warmup, and the suppression list.
- **Runs with or without API keys.** No `ANTHROPIC_API_KEY` → a deterministic
  StubProvider writes real, memory-grounded copy; no `VOYAGE_API_KEY` → a
  deterministic local embedder; no Google/Cal.com creds → the simulation
  mailbox + calendar. Add the keys to switch to Claude + Voyage + real Gmail +
  Cal.com with zero code changes.

- **Self-improvement, bounded (M6).** A nightly **reflection** job analyzes real
  outcomes (reply/booking rate by **opener** and **send-hour**) and proposes
  **metric-justified** changes — only to copy/timing, never identity/compliance.
  Each proposal is **apply/veto** and logged to a *"what it taught itself"* trail.
  A deterministic **~15% A/B holdout** measures lift against a control, so
  improvement is **measured, not asserted**. The Command Center's "agent updated
  itself" card shows the latest applied change.

### What's still to come

| Area | Milestone |
| --- | --- |
| Microsoft Graph, Calendly, HubSpot/Sheets/Mailchimp/Kajabi importers | M7 |
| Reseller / white-label roll-up screens | M8 |

The nav shows later screens marked **SOON** so the structure is locked now.
**Every send is still gated by approval** (v1 default). Compliance rails + the Deliverability view land in M5.

---

## Run it locally

### 1. Database

Either use the bundled Postgres+pgvector container:

```bash
docker compose up -d        # Postgres 16 with pgvector on :5432
```

…or point `DATABASE_URL` at any Postgres you have. (pgvector is unused until M2.)

### 2. Configure env

```bash
cp .env.example .env
# The defaults in .env.example match docker-compose; set AUTH_SECRET +
# ENCRYPTION_KEY for real use:  openssl rand -base64 32
```

### 3. Install, migrate, seed

```bash
npm install
npm run db:generate     # prisma client
npm run db:migrate      # apply migrations
npm run db:seed         # demo agency + 2 client orgs + sample leads
```

### 4. Start

```bash
npm run dev             # http://localhost:3000
```

**Demo logins** (from the seed):

| Workspace | Login | Password | Leads |
| --- | --- | --- | --- |
| Monroe Coaching | `jessica@monroe.coach` | `warmsweep123` | 4 |
| Apex Fitness | `marco@apexfit.co` | `warmsweep123` | 2 |

Sign in as each to *see* tenant isolation: neither org can see the other's leads.

### 5. Try the acceptance path (M1 + M2)

1. Sign in as Jessica → **Command Center** shows the sweep.
2. **Leads** → click a row → the drawer shows *what the agent understands* and the
   real *next message it will send* (Dana & Phil come pre-drafted from the seed).
3. **New sweep** → upload a CSV (headers + an email column) → map columns →
   confirm the prior-contact attestation → import. Suppressed/duplicate rows are
   reported and skipped.
4. **The Agent** → see the learned **voice profile**, memory stats, and the agent
   run log (tokens + cost per step). Click **Learn from emails** to paste your own.
5. **Leads** → *Generate drafts for N eligible* (or per-lead in the drawer). The
   agent grounds each draft in that lead's memory and queues it.
6. **Approvals** → review variants, edit, **approve / reject / approve-all**.
   Opted-out / suppressed leads are refused a draft entirely.
7. **Connections** → the seed connects a **simulated mailbox** (or connect Gmail
   if you set `GOOGLE_CLIENT_ID/SECRET`). On **Approvals**, the approved drafts
   show under **“ready to send” → Send**.
8. **Conversations** → the sent threads appear (Dana already replied in the seed;
   Phil's call is already **booked**). Use **Simulate positive reply / opt-out /
   bounce** to watch the agent classify the reply, advance the lead, and draft a
   response. **Book the call →** offers real slots; pick one to book → the thread
   flips to "Call booked to your calendar".
9. **Command Center** → recovered revenue, calls booked, reply rate, the 7-day
   reactivations chart, and the live activity feed all reflect what just happened.

> Sign in as `marco@apexfit.co` to confirm isolation: Apex sees none of Monroe's
> leads, drafts, voice, memory, mailboxes, or conversations.

---

## Scripts

| Script | Does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js dev / production build / serve |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest (unit + DB-backed isolation/import tests) |
| `npm run db:migrate` / `db:deploy` | Prisma migrate (dev / prod) |
| `npm run db:seed` | Seed demo data |
| `npm run db:reset` | Drop + re-migrate + re-seed |

> Tests hit the dev database via `DATABASE_URL`. The isolation test
> (`src/lib/__tests__/tenancy.test.ts`) is the load-bearing one: it proves org B
> cannot read, count, or update org A's rows through the scoped client.

---

## Architecture notes

- **Tenancy choke point** (`src/lib/tenancy.ts`): `orgScoped(orgId)` returns a
  thin client that injects `orgId` into every read and stamps it on every write.
  Deliberately explicit (not Prisma middleware) so scoping is visible and
  unit-testable at each call site.
- **Org model** supports `Agency → Client` now (M8 only builds the *UI*) so we
  don't re-migrate tenancy later.
- **Lead** carries agent-facing fields (`originalInquiry`, `statedGoal`,
  `status`, `consentBasis`) so the M3 state machine needs no schema change.
- **Crypto** (`src/lib/crypto.ts`): AES-256-GCM envelope encryption for OAuth
  tokens at rest — present now, first used in M3.
- **Embeddings**: reasoning/copywriting uses Claude; embeddings (M2) use Voyage
  behind an interface (Anthropic has no embeddings endpoint).
- **Secrets** are server-side only; the Anthropic key and OAuth secrets never
  reach client code.

## Tech stack

Next.js 15 · React 19 · TypeScript · Prisma 6 / Postgres (+ pgvector from M2) ·
Auth.js (NextAuth 5) · Tailwind CSS 3 · Zod · Vitest · Inngest (jobs, from M2/M6).
