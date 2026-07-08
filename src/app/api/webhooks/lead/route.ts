import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyWebhookToken } from "@/lib/webhook-token";
import { parseInboundLead } from "@/lib/leadsource/inbound";
import { ingestLeads } from "@/lib/import/ingest";
import { runSpeedToLeadForOrg } from "@/lib/agent/speed-to-lead";
import { reportError } from "@/lib/observability/report";

/**
 * Inbound lead webhook — a signed public endpoint a form/CRM POSTs a new lead to.
 * On arrival the lead is ingested through the SAME pipeline as an import (prior-
 * contact gate, suppression, verification, entitlement/quota) and Speed-to-Lead
 * fires immediately, so a genuinely new lead is contacted within minutes of the
 * source — not on the next cron pass.
 *
 * The per-org token in ?t=… identifies the workspace (the endpoint is otherwise
 * unauthenticated, so the URL itself must scope the write to one tenant).
 * Configuring this webhook is the standing prior-contact attestation for the
 * source, mirroring autopilot sync.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const orgId = verifyWebhookToken(req.nextUrl.searchParams.get("t"));
  if (!orgId) return NextResponse.json({ ok: false, error: "invalid token" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const lead = parseInboundLead(body);
  if (!lead) return NextResponse.json({ ok: false, error: "a valid email is required" }, { status: 422 });

  try {
    const res = await ingestLeads([lead], {
      orgId,
      name: "Inbound webhook",
      source: "webhook",
      consentBasis: "EXPLICIT_CONSENT", // they submitted a form / opted in at the source
      priorContactAttested: true, // attested when the operator wired up the webhook
    });
    if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 422 });

    // Contact them now (best-effort): drafts + auto-sends for eligible orgs. A
    // failure here never fails the webhook — the lead is already captured and the
    // 3-minute Speed-to-Lead cron is the backstop.
    let contacted = false;
    try {
      const stl = await runSpeedToLeadForOrg(orgId);
      contacted = stl.sent > 0 || stl.drafted > 0;
    } catch (e) {
      reportError(e, { source: "lead-webhook.speed", orgId });
    }

    return NextResponse.json({ ok: true, imported: res.imported, duplicate: res.imported === 0, contacted });
  } catch (err) {
    reportError(err, { source: "lead-webhook", orgId });
    return NextResponse.json({ ok: false, error: "couldn't process lead" }, { status: 500 });
  }
}
