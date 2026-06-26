# The Warm Sweep — *Coach. Don't Chase.*

An AI agent that revives cold leads: it reads prior email history, drafts
persuasive, personalized re-engagement emails **for your approval**, sends from
your own mailbox, detects replies, books calls, and reports results on a
dashboard — with persistent per-lead memory that improves copy and timing over
time.

> Multi-tenant SaaS · Next.js (App Router) + TypeScript · Postgres/Prisma ·
> Auth.js · Tailwind · Zod · Vitest. Built milestone by milestone.

---

## Status — Milestone 1 shipped ✅

**M1: Schema + auth + multi-tenant org model + CSV import + lead table UI.**

What works right now, end-to-end:

- **Multi-tenant from day one.** An Agency (reseller) owns Client orgs; every
  tenant-owned row is `orgId`-scoped and only ever read through a single choke
  point (`src/lib/tenancy.ts`). Proven by a live cross-tenant isolation test.
- **Auth** (Auth.js / NextAuth v5, credentials) with an org + role on the
  session. Sign-up atomically creates User → Org → Membership(CLIENT_ADMIN).
- **CSV import** with a real upload → **column-mapper** → preview → confirm flow,
  including the **prior-contact gate** (§9): reactivation only, never cold spam.
  Import filters out suppressed + duplicate emails server-side.
- **Leads table** (filterable + search) with the *"what the agent understands /
  next message it will send"* drawer (memory fields populate in M2).
- **Command Center** with live lead counts (full KPIs land in M4).

### What's stubbed in M1 (and where it lands)

| Area | Milestone |
| --- | --- |
| Voice profile, memory tables + pgvector, Claude draft engine, Approval queue | M2 |
| Gmail OAuth send + reply detection + agent state machine + Conversations UI | M3 |
| Cal.com booking + booking detection + Command Center KPIs/activity feed | M4 |
| Compliance rails (opt-out, suppression enforcement, caps, warmup) + Deliverability view | M5 |
| Self-improvement reflection job + "what it taught itself" log + A/B | M6 |
| Microsoft Graph, Calendly, HubSpot/Sheets/Mailchimp/Kajabi importers | M7 |
| Reseller / white-label roll-up screens | M8 |

The nav shows later screens marked **SOON** so the structure is locked now.

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

### 5. Try the acceptance path for M1

1. Sign in as Jessica → **Command Center** shows 4 leads.
2. **Leads** → click a row → the drawer shows what the agent understands.
3. **New sweep** → upload a CSV (headers + an email column) → map columns →
   confirm the prior-contact attestation → import. New leads appear in the table;
   suppressed/duplicate rows are reported and skipped.

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
