import { prisma } from "@/lib/prisma";
import { getSecret } from "@/lib/config/secrets";

/**
 * Go-Live Readiness — programmatically inspects the environment so the operator
 * can see, at a glance, exactly what's configured and what still blocks launch,
 * instead of checking a doc by hand. Every check reads live config (env or the
 * in-app secret store) or the database. Nothing here mutates anything.
 */

export type CheckStatus = "ok" | "warn" | "missing";

export interface ReadinessCheck {
  label: string;
  status: CheckStatus;
  detail: string;
}

export interface ReadinessGroup {
  group: string;
  blocking: boolean; // a "missing" here blocks launch
  checks: ReadinessCheck[];
}

export interface ReadinessReport {
  ready: boolean; // no blocking check is missing
  blockers: number;
  warnings: number;
  groups: ReadinessGroup[];
}

function ok(label: string, detail = "Configured"): ReadinessCheck {
  return { label, status: "ok", detail };
}
function missing(label: string, detail: string): ReadinessCheck {
  return { label, status: "missing", detail };
}
function warn(label: string, detail: string): ReadinessCheck {
  return { label, status: "warn", detail };
}
const set = (v: string | undefined) => Boolean(v && v.trim());

export async function goLiveReport(): Promise<ReadinessReport> {
  // Gather every value up front (secrets store + env), then reason synchronously.
  const [
    stripeKey, stripeWebhook, priceId, priceTiers, feFront, feBump, feOto1, perfBase, perfMetered,
    resendKey, emailFrom, anthropic, voyage, googleId, googleSecret, msId, msSecret, exploreMode,
  ] = await Promise.all([
    getSecret("STRIPE_SECRET_KEY"), getSecret("STRIPE_WEBHOOK_SECRET"), getSecret("STRIPE_PRICE_ID"),
    getSecret("STRIPE_PRICE_TIERS"), getSecret("STRIPE_PRICE_FRONT_END"), getSecret("STRIPE_PRICE_BUMP"),
    getSecret("STRIPE_PRICE_OTO1"), getSecret("STRIPE_PRICE_PERFORMANCE_BASE"), getSecret("STRIPE_PRICE_PERFORMANCE_METERED"),
    getSecret("RESEND_API_KEY"), getSecret("EMAIL_FROM"), getSecret("ANTHROPIC_API_KEY"), getSecret("VOYAGE_API_KEY"),
    getSecret("GOOGLE_CLIENT_ID"), getSecret("GOOGLE_CLIENT_SECRET"), getSecret("MICROSOFT_CLIENT_ID"),
    getSecret("MICROSOFT_CLIENT_SECRET"), getSecret("EXPLORE_MODE"),
  ]);

  // Env-only infrastructure.
  const cronSecret = process.env.CRON_SECRET;
  const encKey = process.env.ENCRYPTION_KEY;
  const nextauthUrl = process.env.NEXTAUTH_URL;
  const authSecret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  const sentry = process.env.SENTRY_DSN;

  let encKeyValid = false;
  try { encKeyValid = Boolean(encKey) && Buffer.from(encKey as string, "base64").length === 32; } catch { encKeyValid = false; }

  // Per-workspace readiness (CAN-SPAM address + a connected sending mailbox).
  const [clientOrgs, missingAddress, orgsWithMailbox] = await Promise.all([
    prisma.org.count({ where: { type: "CLIENT" } }),
    prisma.org.count({ where: { type: "CLIENT", OR: [{ mailingAddress: null }, { mailingAddress: "" }] } }),
    prisma.mailbox.findMany({ where: { status: "CONNECTED", provider: { not: "SIMULATION" } }, select: { orgId: true }, distinct: ["orgId"] }),
  ]);
  const withMailbox = new Set(orgsWithMailbox.map((m) => m.orgId)).size;

  const groups: ReadinessGroup[] = [
    {
      group: "Payments (Stripe)",
      blocking: true,
      checks: [
        set(stripeKey) ? ok("Secret key") : missing("Secret key", "STRIPE_SECRET_KEY unset — checkout can't run."),
        set(stripeWebhook) ? ok("Webhook secret", "Also register the endpoint in Stripe → Webhooks.") : missing("Webhook secret", "STRIPE_WEBHOOK_SECRET unset — subscription state won't sync."),
        set(priceId) ? ok("Continuity price ($297)") : missing("Continuity price", "STRIPE_PRICE_ID unset — the flagship plan can't be sold."),
        priceTiers ? (validJson(priceTiers) ? ok("Price → tier map") : warn("Price → tier map", "STRIPE_PRICE_TIERS is not valid JSON — it's being ignored.")) : warn("Price → tier map", "STRIPE_PRICE_TIERS unset — only the default price maps to a tier."),
        set(feFront) && set(feOto1) && set(feBump) ? ok("One-time prices ($27/+$17/$197)") : warn("One-time prices", "Front-of-funnel one-time tiers can't sell until STRIPE_PRICE_FRONT_END/_BUMP/_OTO1 are set."),
        set(perfBase) && set(perfMetered) ? ok("Performance prices ($97 + metered)") : warn("Performance prices", "The pay-per-call plan can't sell until STRIPE_PRICE_PERFORMANCE_BASE/_METERED are set."),
      ],
    },
    {
      group: "Email (Resend)",
      blocking: true,
      checks: [
        set(resendKey) ? ok("API key") : missing("API key", "RESEND_API_KEY unset — verification, reset, invites, and booking confirmations won't send."),
        !set(emailFrom)
          ? warn("From address", "EMAIL_FROM unset — falls back to the shared test domain. Set a verified domain.")
          : (emailFrom as string).includes("resend.dev")
            ? warn("From address", "Using resend.dev (shared test domain) — verify your own domain for deliverability.")
            : ok("From address", emailFrom as string),
      ],
    },
    {
      group: "AI",
      blocking: true,
      checks: [
        set(anthropic) ? ok("Anthropic API key") : missing("Anthropic API key", "ANTHROPIC_API_KEY unset — drafts are stubs, not real copy."),
        set(voyage) ? ok("Voyage embeddings key") : warn("Voyage embeddings key", "VOYAGE_API_KEY unset — memory/retrieval runs degraded."),
      ],
    },
    {
      group: "Sending mailboxes (OAuth)",
      blocking: true,
      checks: [
        set(googleId) && set(googleSecret) && set(msId) && set(msSecret)
          ? ok("Gmail + Outlook OAuth")
          : set(googleId) && set(googleSecret)
            ? ok("Gmail OAuth", "Outlook OAuth not set — Gmail-only is fine to launch.")
            : set(msId) && set(msSecret)
              ? ok("Outlook OAuth", "Gmail OAuth not set — Outlook-only is fine to launch.")
              : missing("Gmail / Outlook OAuth", "Neither provider is configured — customers can't connect a real inbox. (Google scopes also need app verification — start early.)"),
      ],
    },
    {
      group: "Infrastructure",
      blocking: true,
      checks: [
        set(cronSecret) ? ok("Cron secret") : missing("Cron secret", "CRON_SECRET unset — every scheduled job (autopilot, speed-to-lead, guarantees) is locked."),
        encKeyValid ? ok("Encryption key") : missing("Encryption key", encKey ? "ENCRYPTION_KEY set but not a 32-byte base64 value." : "ENCRYPTION_KEY unset — connected credentials can't be stored."),
        set(nextauthUrl) ? ok("App URL", nextauthUrl as string) : missing("App URL", "NEXTAUTH_URL unset — OAuth callbacks, email links, and webhooks break."),
        set(authSecret) ? ok("Auth secret") : missing("Auth secret", "AUTH_SECRET / NEXTAUTH_SECRET unset — sessions aren't secure."),
        set(sentry) ? ok("Error monitoring (Sentry)") : warn("Error monitoring", "SENTRY_DSN unset — backend errors won't page you."),
        set(exploreMode) && /^(1|true|on)$/i.test((exploreMode as string).trim())
          ? warn("Explore mode", "EXPLORE_MODE is ON — customers can see the sample-data / test-inbox surfaces. Turn it off for launch.")
          : ok("Explore mode", "Off — customers see production surfaces only."),
      ],
    },
    {
      group: "Workspaces",
      blocking: false,
      checks: [
        clientOrgs === 0
          ? ok("Mailing address (CAN-SPAM)", "No workspaces yet.")
          : missingAddress === 0
            ? ok("Mailing address (CAN-SPAM)", `All ${clientOrgs} workspaces have one.`)
            : warn("Mailing address (CAN-SPAM)", `${missingAddress} of ${clientOrgs} workspaces have no mailing address — they can't send until they add one.`),
        clientOrgs === 0
          ? ok("Connected mailbox", "No workspaces yet.")
          : warn("Connected mailbox", `${withMailbox} of ${clientOrgs} workspaces have a real inbox connected.`),
      ],
    },
  ];

  let blockers = 0;
  let warnings = 0;
  for (const g of groups) {
    for (const c of g.checks) {
      if (c.status === "warn") warnings += 1;
      if (c.status === "missing" && g.blocking) blockers += 1;
    }
  }

  return { ready: blockers === 0, blockers, warnings, groups };
}

function validJson(s: string): boolean {
  try { JSON.parse(s); return true; } catch { return false; }
}
