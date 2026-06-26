# Build plan & milestone tracker

The Warm Sweep ships in runnable slices. v1 (acceptance) = M1–M5.

- [x] **M1 — Foundation.** Schema + auth + multi-tenant org model + CSV import + lead table UI.
- [ ] **M2 — Memory & drafting.** Voice profile + memory tables/pgvector + Claude draft engine + Approval queue (render email, no real send).
- [ ] **M3 — Send loop.** Gmail OAuth send + reply detection + agent state machine + Conversations UI.
- [ ] **M4 — Booking & KPIs.** Cal.com booking + booking detection + Command Center KPIs/activity feed.
- [ ] **M5 — Compliance & deliverability.** Opt-out, suppression enforcement, caps, warmup + Deliverability view.
- [ ] **M6 — Self-improvement.** Nightly reflection job + "what it taught itself" log + A/B holdout.
- [ ] **M7 — More integrations.** Microsoft Graph + Calendly + HubSpot/Sheets/Mailchimp/Kajabi importers.
- [ ] **M8 — Reseller/white-label.** Agency roll-up + per-client branding + per-seat billing fields.

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
