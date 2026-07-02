"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveIntegrationsAction } from "@/server/actions/integrations";
import { toast } from "@/components/ui/Toast";
import { SpinnerLabel } from "@/components/ui/Spinner";

type Status = Record<string, { set: boolean; source: "app" | "env" | null }>;

interface Field { key: string; label: string; placeholder: string; secret?: boolean }
interface Provider { id: string; name: string; blurb: string; statusKeys: string[]; fields: Field[]; help?: string }

const PROVIDERS: Provider[] = [
  {
    id: "stripe",
    name: "Payments — Stripe",
    blurb: "Charge customers a subscription. Paste your keys from the Stripe dashboard.",
    statusKeys: ["STRIPE_SECRET_KEY", "STRIPE_PRICE_ID"],
    help: "Stripe Dashboard → Developers → API keys (Secret key), Products (Price ID), and Webhooks (signing secret for /api/webhooks/stripe).",
    fields: [
      { key: "STRIPE_SECRET_KEY", label: "Secret key", placeholder: "sk_live_…", secret: true },
      { key: "STRIPE_PRICE_ID", label: "Price ID", placeholder: "price_…" },
      { key: "STRIPE_WEBHOOK_SECRET", label: "Webhook signing secret", placeholder: "whsec_…", secret: true },
      { key: "STRIPE_PLAN_NAME", label: "Plan name (display)", placeholder: "The Warm Sweep" },
      { key: "STRIPE_PLAN_PRICE_LABEL", label: "Price label (display)", placeholder: "$297/mo" },
    ],
  },
  {
    id: "email",
    name: "Email — Resend",
    blurb: "Send password resets, verifications, invites, and receipts from your domain.",
    statusKeys: ["RESEND_API_KEY"],
    help: "Resend → API Keys, and a verified sender domain for the From address.",
    fields: [
      { key: "RESEND_API_KEY", label: "API key", placeholder: "re_…", secret: true },
      { key: "EMAIL_FROM", label: "From address", placeholder: "The Warm Sweep <hi@yourdomain.com>" },
    ],
  },
  {
    id: "gmail",
    name: "Mailbox — Gmail / Google",
    blurb: "Let your team connect Gmail mailboxes for outreach (the OAuth app credentials).",
    statusKeys: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    help: "Google Cloud Console → APIs & Services → Credentials → OAuth client (Web). Enable the Gmail API, and add the authorized redirect URI: <your-domain>/api/connections/gmail/callback.",
    fields: [
      { key: "GOOGLE_CLIENT_ID", label: "Client ID", placeholder: "…apps.googleusercontent.com" },
      { key: "GOOGLE_CLIENT_SECRET", label: "Client secret", placeholder: "GOCSPX-…", secret: true },
    ],
  },
  {
    id: "microsoft",
    name: "Mailbox — Outlook / Microsoft",
    blurb: "Let your team connect Outlook / Microsoft 365 mailboxes for outreach.",
    statusKeys: ["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET"],
    help: "Azure Portal → App registrations → your app. Add the redirect URI: <your-domain>/api/connections/microsoft/callback, and grant Mail.Send / Mail.Read / User.Read.",
    fields: [
      { key: "MICROSOFT_CLIENT_ID", label: "Application (client) ID", placeholder: "00000000-0000-…" },
      { key: "MICROSOFT_CLIENT_SECRET", label: "Client secret value", placeholder: "secret value", secret: true },
    ],
  },
  {
    id: "ai",
    name: "AI — Claude & Voyage",
    blurb: "Power drafting & replies with Claude and retrieval with Voyage. Without keys, a deterministic local fallback is used.",
    statusKeys: ["ANTHROPIC_API_KEY"],
    help: "Anthropic Console → API Keys for Claude. Voyage AI dashboard for embeddings (optional). Model names are optional — sensible defaults are used.",
    fields: [
      { key: "ANTHROPIC_API_KEY", label: "Anthropic API key", placeholder: "sk-ant-…", secret: true },
      { key: "ANTHROPIC_MODEL", label: "Model (optional)", placeholder: "claude-sonnet-5" },
      { key: "ANTHROPIC_MODEL_FAST", label: "Fast model (optional)", placeholder: "claude-haiku-4-5-20251001" },
      { key: "VOYAGE_API_KEY", label: "Voyage API key (optional)", placeholder: "pa-…", secret: true },
      { key: "VOYAGE_MODEL", label: "Voyage model (optional)", placeholder: "voyage-3" },
    ],
  },
];

export function IntegrationsSection({ status, isAdmin }: { status: Status; isAdmin: boolean }) {
  if (!isAdmin) return null;
  return (
    <div className="mt-6 rounded-xl2 border border-line bg-white p-6 shadow-card">
      <p className="m-0 mb-1 font-heading text-[16px] font-semibold text-ink">Integrations</p>
      <p className="m-0 mb-5 text-[13px] text-muted">Connect services in a few clicks — no redeploy. Keys are encrypted at rest.</p>
      <div className="flex flex-col gap-3">
        {PROVIDERS.map((p) => <ProviderCard key={p.id} provider={p} status={status} />)}
      </div>
    </div>
  );
}

function ProviderCard({ provider, status }: { provider: Provider; status: Status }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [vals, setVals] = useState<Record<string, string>>({});

  const connected = provider.statusKeys.every((k) => status[k]?.set);
  const source = provider.statusKeys.map((k) => status[k]?.source).find(Boolean);

  function save() {
    const toSave = Object.fromEntries(Object.entries(vals).filter(([, v]) => v.trim() !== ""));
    if (Object.keys(toSave).length === 0) { setOpen(false); return; }
    startTransition(async () => {
      const r = await saveIntegrationsAction(toSave);
      if (r.ok) { toast("Integration saved.", "success"); setVals({}); setOpen(false); router.refresh(); }
      else toast(r.error ?? "Couldn't save.", "error");
    });
  }

  return (
    <div className="rounded-xl border border-line-2 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="m-0 flex items-center gap-2 font-heading text-[14.5px] font-semibold text-ink">
            {provider.name}
            <span className={`rounded px-1.5 py-0.5 text-[10.5px] font-semibold ${connected ? "bg-[rgba(27,122,87,0.1)] text-sweep" : "bg-line-2 text-muted-2"}`}>
              {connected ? `Connected${source === "env" ? " · env" : ""}` : "Not connected"}
            </span>
          </p>
          <p className="m-0 mt-0.5 text-[12.5px] text-muted-2">{provider.blurb}</p>
        </div>
        <button onClick={() => setOpen((v) => !v)} className="flex-none rounded-lg border border-line-3 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-muted hover:bg-cream">
          {open ? "Close" : connected ? "Update" : "Connect"}
        </button>
      </div>

      {open && (
        <div className="mt-4 flex flex-col gap-2.5 border-t border-line-2 pt-4">
          {provider.fields.map((f) => (
            <div key={f.key}>
              <label className="mb-1 block text-[12px] font-semibold text-ink">
                {f.label}
                {status[f.key]?.set && <span className="ml-1.5 font-normal text-muted-3">· set ••••</span>}
              </label>
              <input
                type={f.secret ? "password" : "text"}
                value={vals[f.key] ?? ""}
                onChange={(e) => setVals((s) => ({ ...s, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                autoComplete="off"
                className="w-full rounded-lg border border-line-3 bg-white px-3 py-2 text-[13.5px] outline-none focus:border-sweep focus:ring-2 focus:ring-[rgba(27,122,87,0.12)]"
              />
            </div>
          ))}
          {provider.help && <p className="m-0 text-[11.5px] leading-[1.45] text-muted-3">{provider.help}</p>}
          <button
            onClick={save}
            disabled={pending}
            className="mt-1 self-start rounded-lg bg-sweep px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {pending ? <SpinnerLabel>Saving…</SpinnerLabel> : "Save"}
          </button>
        </div>
      )}
    </div>
  );
}
