import { resolveTxt } from "node:dns/promises";
import { prisma } from "@/lib/prisma";
import { bounceRate, complaintRate, effectiveDailyCap, warmupDay, isWarmingUp, rateAlert } from "@/lib/compliance/caps";

/**
 * Deliverability signals for the Deliverability view (§9). Computes a real
 * sender-health score from bounce/complaint rates, domain-auth status, and
 * warmup progress — not a vanity number.
 */

export interface DomainAuth {
  domain: string | null;
  spf: boolean;
  dkim: boolean; // best-effort; DKIM selectors vary, so we report "configured" heuristically
  dmarc: boolean;
  checked: boolean; // false when no domain set or DNS unavailable
}

// Best-effort DNS check for SPF + DMARC (DKIM selector is provider-specific).
export async function checkDomainAuth(domain: string | null): Promise<DomainAuth> {
  if (!domain) return { domain: null, spf: false, dkim: false, dmarc: false, checked: false };
  try {
    const [root, dmarc] = await Promise.allSettled([resolveTxt(domain), resolveTxt(`_dmarc.${domain}`)]);
    const rootTxt = root.status === "fulfilled" ? root.value.flat().join(" ") : "";
    const dmarcTxt = dmarc.status === "fulfilled" ? dmarc.value.flat().join(" ") : "";
    return {
      domain,
      spf: /v=spf1/i.test(rootTxt),
      dkim: false, // can't verify without the selector; surfaced as guidance in UI
      dmarc: /v=DMARC1/i.test(dmarcTxt),
      checked: true,
    };
  } catch {
    return { domain, spf: false, dkim: false, dmarc: false, checked: false };
  }
}

/**
 * §4: refresh + persist the custom domain's auth status. SPF + DMARC must verify
 * before a custom sending domain may send; we cache the result on the org so the
 * send-time gate is a cheap boolean read, not a DNS lookup per message. DKIM
 * selectors are provider-specific and can't be checked blind, so the gate keys
 * on SPF + DMARC (the two we can verify), with DKIM surfaced as UI guidance.
 */
export async function refreshDomainAuth(orgId: string): Promise<DomainAuth> {
  const org = await prisma.org.findUnique({ where: { id: orgId }, select: { fromDomain: true } });
  const auth = await checkDomainAuth(org?.fromDomain ?? null);
  const ok = auth.checked && auth.spf && auth.dmarc;
  await prisma.org.update({ where: { id: orgId }, data: { domainAuthOk: ok, domainAuthCheckedAt: new Date() } });
  return auth;
}

/**
 * The send-time gate (§4): a custom sending domain cannot send until SPF + DMARC
 * verify. When no custom domain is set, sending goes through the connected
 * provider (Gmail/Microsoft), whose domain auth the provider manages — so there
 * is nothing to block. Throws DomainAuthError with a fix-it message otherwise.
 */
export class DomainAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainAuthError";
  }
}

export async function assertDomainAuthorized(orgId: string): Promise<void> {
  const org = await prisma.org.findUnique({
    where: { id: orgId },
    select: { fromDomain: true, domainAuthOk: true },
  });
  if (!org?.fromDomain) return; // provider-managed domain — nothing to verify
  if (!org.domainAuthOk) {
    throw new DomainAuthError(
      `Sending is blocked for ${org.fromDomain} until SPF and DMARC are verified. Add the DNS records, then re-check on the Deliverability page.`,
    );
  }
}

export interface MailboxHealth {
  id: string;
  email: string;
  provider: string;
  status: string;
  pausedReason: string | null;
  sentTotal: number;
  bounceRatePct: number;
  complaintRatePct: number;
  sentToday: number;
  effectiveDailyCap: number;
  dailyCap: number;
  hourlyCap: number;
  warmupDay: number;
  warming: boolean;
  alert: "ok" | "alert"; // early-warning tier (before hard-stop)
  alertReason: string | null;
  requiresRescrub: boolean;
}

export interface DeliverabilitySummary {
  healthScore: number; // 0..100
  healthLabel: string;
  inboxPlacementPct: number;
  bounceRatePct: number;
  complaintRatePct: number;
  mailboxes: MailboxHealth[];
  auth: DomainAuth;
  suppressionCount: number;
}

export async function deliverabilitySummary(orgId: string): Promise<DeliverabilitySummary> {
  const [mailboxes, org, suppressionCount] = await Promise.all([
    prisma.mailbox.findMany({ where: { orgId }, orderBy: { createdAt: "asc" } }),
    prisma.org.findUnique({ where: { id: orgId }, select: { fromDomain: true } }),
    prisma.suppressionEntry.count({ where: { orgId } }),
  ]);

  const totalSent = mailboxes.reduce((n, m) => n + m.sentTotal, 0);
  const totalBounce = mailboxes.reduce((n, m) => n + m.bounceCount, 0);
  const totalComplaint = mailboxes.reduce((n, m) => n + m.complaintCount, 0);
  const orgBounceRate = totalSent ? totalBounce / totalSent : 0;
  const orgComplaintRate = totalSent ? totalComplaint / totalSent : 0;

  const auth = await checkDomainAuth(org?.fromDomain ?? null);

  // Score: start at 100, subtract for bounces, complaints, missing auth, and any
  // paused mailbox. Bounded [0, 100].
  let score = 100;
  score -= Math.min(40, orgBounceRate * 100 * 4); // -4 per 1% bounce, cap -40
  score -= Math.min(30, orgComplaintRate * 100 * 30); // complaints hurt hard
  if (auth.checked) {
    if (!auth.spf) score -= 10;
    if (!auth.dmarc) score -= 10;
  } else if (org?.fromDomain) {
    score -= 5; // domain set but unverifiable
  }
  if (mailboxes.some((m) => m.status === "PAUSED")) score -= 15;
  score = Math.max(0, Math.min(100, Math.round(score)));

  const healthLabel = score >= 85 ? "excellent" : score >= 70 ? "good" : score >= 50 ? "fair" : "at risk";
  // Inbox placement estimate derived from score (a simple monotonic mapping).
  const inboxPlacementPct = Math.round((85 + (score - 50) * 0.3) * 10) / 10;

  return {
    healthScore: score,
    healthLabel,
    inboxPlacementPct: Math.max(0, Math.min(99.9, inboxPlacementPct)),
    bounceRatePct: Math.round(orgBounceRate * 1000) / 10,
    complaintRatePct: Math.round(orgComplaintRate * 1000) / 10,
    suppressionCount,
    auth,
    mailboxes: mailboxes.map((m) => ({
      id: m.id,
      email: m.email,
      provider: m.provider,
      status: m.status,
      pausedReason: m.pausedReason,
      sentTotal: m.sentTotal,
      bounceRatePct: Math.round(bounceRate(m) * 1000) / 10,
      complaintRatePct: Math.round(complaintRate(m) * 1000) / 10,
      sentToday: m.sentToday,
      effectiveDailyCap: effectiveDailyCap(m),
      dailyCap: m.dailyCap,
      hourlyCap: m.hourlyCap,
      warmupDay: warmupDay(m),
      warming: isWarmingUp(m),
      alert: rateAlert(m).level,
      alertReason: rateAlert(m).reason ?? null,
      requiresRescrub: m.requiresRescrub,
    })),
  };
}
