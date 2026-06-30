# The Warm Sweep™ — Systeme.io Funnel Kit

Paste-ready build of the *Coach. Don't Chase.* value-ladder funnel, rebuilt so
**every block survives a paste into Systeme.io** and every conversion-critical
element is a **native Systeme element** (so it actually captures leads and takes
payment). Nothing in here asks Systeme to do something its builder can't.

> Source of truth: the Claude Design prototype `Warm_Sweep_Funnel__Standalone`.
> This kit reproduces its copy and look using **Raw HTML elements** for design and
> **native Systeme elements** for capture, checkout, upsells, and subscriptions.

---

## The golden rule (why this kit is split the way it is)

Systeme.io's **Raw HTML element** accepts HTML + CSS + JS and renders it on
sales pages, order forms, and thank-you pages — but **a pasted `<form>` does not
talk to Systeme's CRM or payment engine.** So:

- **Design, copy, layout, animation** → Raw HTML element (the `.html` files here).
- **Email capture, card payment, order bumps, 1-click upsells, subscriptions** →
  **native Systeme elements.** Never paste card fields — they won't process and
  it's a PCI problem. Each page file marks exactly where the native element drops in
  with a `⬇⬇⬇ NATIVE SYSTEME ELEMENT ⬇⬇⬇` comment.

Raw HTML is **not** available on *Info pages* — always use the page types below.

---

## Funnel map → Systeme funnel steps

Build one funnel (`Funnels → Create`, type **Custom / Sales funnel**) with these
steps, in order. The "Step type" column is what you pick in Systeme when you add
the step — it changes what Systeme wires up on the back end.

| # | File | Systeme step type | Native element you add | Goes to next via |
|---|------|-------------------|------------------------|------------------|
| 1 | `p1-optin.html` | **Squeeze page** | Opt-in form (Email) | Form success → step 2 |
| 2 | `p2-thankyou.html` | Thank-you page | — (2 buttons) | Buttons → audit link / step 3 |
| 3 | `p3-sales-27.html` | **Sales page** | "Buy" button | Button → step 4 (order form) |
| 4 | `co-checkout.html` | **Order form** | Order form + **order bump** | Auto → step 5 after payment |
| 5 | `p4-oto-197.html` | **Upsell** (1-click) | Upsell *accept* + *decline* links | Accept→pay→6 · Decline→6 |
| 6 | `p5-downsell-97.html` | **Downsell** (1-click) | Upsell *accept* + *decline* links | Either → step 7 |
| 7 | `p8-onboarding.html` | Thank-you page | — (intake button) | Button → intake form |
| — | `p6-continuity-297.html` | **Separate funnel**: Sales + subscription order form | Subscription product | — |
| — | `p7-reseller.html` | **Separate funnel**: Sales + application form | Native form (qualify) | Form → manual approve |

**Why p6 and p7 are separate funnels:** they're not part of the $27 buy-flow.
The $297/mo continuity and the $497–997 reseller are their own offers you promote
later (email sequence, dashboard upsell). Building them as their own funnels keeps
the core SLO (self-liquidating offer) flow clean: **free audit → $27 → $197 → $97 → onboard.**

---

## Order of operations (do this once, top to bottom)

1. **Settings → Fonts:** the design uses **Poppins** (headings) + **Inter** (body).
   Each `.html` file `@import`s them, so you don't have to — but if Systeme strips the
   import on your plan, add both under *Settings → Custom fonts* and they'll match.
2. **Create the products first** (`Products`): `$27 Founding Charter` (one-time),
   `$10 Fast-Start` (one-time, used as the **order bump**), `$197 Vault Sweep`
   (one-time, the **OTO**), `$97 Speed-to-Lead` (one-time, the **downsell**).
   Continuity `$297/mo` and reseller `$497`/`$997` are subscription products in their own funnels.
3. **Build the funnel steps** in the table order. For each design page:
   add a **Raw HTML** element, open *Edit code*, paste the matching file **whole**, Save.
4. **Drop the native elements** at each `⬇⬇⬇ NATIVE` marker (see per-page notes below).
5. **Wire the links** (`How to link between funnel pages`): every styled CTA in the
   HTML that says `href="#NEXT"` must point at the next step, **or** delete it and place a
   **native Systeme button** on top (recommended — native buttons track clicks).
6. **Tags & automation** (see below) so the agent/CRM can act on each step.
7. **Preview every step on mobile** in Systeme — the HTML is responsive (`clamp()` +
   `max-width`), but always eyeball it.

---

## Per-step native element notes

**Step 1 — Squeeze (`p1-optin.html`):** Place a native **Opt-in form** at the
marker. One field: **Email**. On submit: **tag `audit-requested`** and **redirect to
step 2**. The hero and the bottom CTA both have a form marker — use one native form
(top) and a native button (bottom) that scrolls to it, or duplicate the form.

**Step 2 — Thank-you (`p2-thankyou.html`):** No form. Two native buttons:
"Open My Found-Money Audit" → your audit URL/PDF; "Show Me the Done-For-You Offer"
→ step 3.

**Step 3 — Sales (`p3-sales-27.html`):** Each "Claim My Founding Spot" CTA →
native button → step 4 (the order form). This page sells; it does not take payment.

**Step 4 — Order form (`co-checkout.html`):** This is mostly **native**. Add the
Systeme **order form** (Email + Name + Card) — *do not paste the card HTML*. Attach
product `$27 Founding Charter`. Turn on the **order bump** and attach `$10 Fast-Start`
with the bump copy from the file. The Raw HTML here is only the headline, the
order-summary card, and the guarantee strip around the native form.

**Step 5 — Upsell `$197` (`p4-oto-197.html`):** Mark it an **Upsell** step.
The green "Yes — Sweep My Entire Back-Catalog for $197" button = native **upsell
accept** link (1-click charge, no re-entry). The "No thanks" text = native **upsell
decline** link. Both go to step 6.

**Step 6 — Downsell `$97` (`p5-downsell-97.html`):** **Downsell** step, shown only
to those who declined $197 (Systeme handles the branch). Accept/decline = native
upsell links → step 7.

**Step 7 — Onboarding (`p8-onboarding.html`):** Thank-you page. "Complete My Intake
Form" → native button → your intake form (a separate Systeme form/page that tags
`onboarding-complete` and hands the list to the agent).

**Continuity (`p6-continuity-297.html`):** Own funnel. Sales page + **subscription
order form** with the `$297/mo` product. CTAs → that order form.

**Reseller (`p7-reseller.html`):** Own funnel. Sales page + a native **application
form** (not a checkout): collect name, audience size, list. On submit → tag
`reseller-applied`, notify you, approve manually, then send the `$497` or `$997`
subscription checkout link.

---

## Tags & automation (the part the API/MCP *can* drive)

Systeme's API/MCP can't draw pages, but it **can** run this nervous system. Wire
these in *Automation → Rules* (and the agent in this repo can read/write the tags):

| Trigger | Tag applied | Automation |
|---------|-------------|------------|
| Opt-in form submitted (step 1) | `audit-requested` | Send audit email; start nurture |
| `$27` purchased (step 4) | `founding-buyer` | Grant access; start onboarding nudge |
| `$197` accepted (step 5) | `vault-upgrade` | — |
| `$97` accepted (step 6) | `speed-to-lead` | — |
| Intake form done (step 7) | `onboarding-complete` | Hand list to the Warm Sweep agent |
| Reseller applied (p7) | `reseller-applied` | Notify founder; send qualification form |

> In this repo, the Warm Sweep agent reactivates leads; a Systeme **opt-in** (step 1)
> can tag a lead → drop them into a Systeme sequence, while genuine replies the agent
> books push the contact to `booked`. The funnel is the front door; the agent is the engine.

---

## Things that are intentionally NOT pasted (and why)

- **Card fields / fake checkout** — native order form only (PCI + processing).
- **`{{ }}` template bindings & the SPA router** from the prototype — replaced by
  real Systeme step links and native buttons.
- **The A/B headline switch** (`A — Open loop` / `B — Dollar reveal`) — rebuild as
  a Systeme **A/B split test** on step 1; both headlines are in `p1-optin.html` (one
  active, one commented).
- **The cross-page tab bar** — that was the prototype's navigator, not part of the funnel.

---

## File index

```
systeme-funnel/
├── README.md                 ← you are here (map + build guide)
├── _design-system.css        ← shared tokens/classes (reference; already inlined per page)
├── p1-optin.html             ← Step 1  Squeeze — Found-Money Audit
├── p2-thankyou.html          ← Step 2  Opt-in thank-you
├── p3-sales-27.html          ← Step 3  $27 Founding Charter sales page
├── co-checkout.html          ← Step 4  Order form wrapper (+ $10 bump)
├── p4-oto-197.html           ← Step 5  $197 Vault Sweep upsell
├── p5-downsell-97.html       ← Step 6  $97 Speed-to-Lead downsell
├── p8-onboarding.html        ← Step 7  Buyer onboarding
├── p6-continuity-297.html    ← $297/mo Always-On (separate funnel)
└── p7-reseller.html          ← $497–997 Reseller (separate funnel)
```

Replace every `[X]` (guarantee call count) and the illustrative receipts/dashboard
with your real numbers before launch.
