/**
 * Transactional email — account-level mail the product sends on its own behalf
 * (verify your email, reset your password, you've been invited, a call booked).
 * Separate from the OUTREACH mailbox (which sends as the operator); these come
 * from the product's own address.
 *
 * Backed by Resend's REST API (no SDK dependency). If RESEND_API_KEY is unset it
 * degrades gracefully: the message is logged and reported as simulated, so every
 * flow that depends on email still works in dev / before the key is configured —
 * the same safe-fallback pattern used elsewhere. Wire a key + verified sender
 * domain to actually deliver.
 */

import { getSecret } from "@/lib/config/secrets";

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export interface SendEmailResult {
  ok: boolean;
  simulated?: boolean;
  id?: string;
  error?: string;
}

export async function isEmailConfigured(): Promise<boolean> {
  return Boolean(await getSecret("RESEND_API_KEY"));
}

export async function sendTransactionalEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const key = await getSecret("RESEND_API_KEY");
  const FROM = (await getSecret("EMAIL_FROM")) || "The Warm Sweep <onboarding@resend.dev>";

  // Graceful fallback: no provider configured → log + succeed (simulated) so the
  // calling flow (signup, reset, invite) isn't blocked in dev.
  if (!key) {
    console.info(`[email:simulated] to=${input.to} subject=${JSON.stringify(input.subject)} (connect email to deliver)`);
    return { ok: true, simulated: true };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        ...(input.text ? { text: input.text } : {}),
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[email] Resend ${res.status}: ${detail.slice(0, 300)}`);
      return { ok: false, error: `Email provider returned ${res.status}` };
    }
    const data = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, id: data.id };
  } catch (err) {
    console.error("[email] send failed:", err);
    return { ok: false, error: "Couldn't reach the email provider." };
  }
}

/**
 * One branded HTML shell for every transactional email — warm theme, a single
 * primary action, and a plain-text-friendly fallback line. Keep it inline-styled
 * (email clients strip <style>/external CSS).
 */
export function renderEmail(opts: {
  heading: string;
  intro: string;
  cta?: { label: string; url: string };
  outro?: string;
  footnote?: string;
}): { html: string; text: string } {
  const { heading, intro, cta, outro, footnote } = opts;
  const button = cta
    ? `<tr><td style="padding:8px 0 24px;">
         <a href="${cta.url}" style="display:inline-block;background:#1B7A57;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:10px;font-family:Inter,Arial,sans-serif;">${cta.label}</a>
       </td></tr>`
    : "";
  const html = `<!doctype html><html><body style="margin:0;background:#FAF7F2;padding:32px 0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #ece7dd;border-radius:14px;overflow:hidden;">
    <tr><td style="padding:26px 30px 0;font-family:Poppins,Inter,Arial,sans-serif;">
      <span style="font-size:15px;font-weight:600;color:#1B7A57;">The Warm Sweep&trade;</span>
    </td></tr>
    <tr><td style="padding:18px 30px 0;">
      <h1 style="margin:0 0 10px;font-family:Poppins,Inter,Arial,sans-serif;font-size:21px;font-weight:600;color:#1A1A1A;letter-spacing:-0.3px;">${heading}</h1>
      <p style="margin:0 0 18px;font-family:Inter,Arial,sans-serif;font-size:14.5px;line-height:1.6;color:#56554e;">${intro}</p>
    </td></tr>
    <tr><td style="padding:0 30px;"><table role="presentation" cellpadding="0" cellspacing="0">${button}</table></td></tr>
    ${outro ? `<tr><td style="padding:0 30px 8px;"><p style="margin:0 0 16px;font-family:Inter,Arial,sans-serif;font-size:13px;line-height:1.6;color:#888780;">${outro}</p></td></tr>` : ""}
    <tr><td style="padding:18px 30px 26px;border-top:1px solid #f1ece3;">
      <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:11.5px;line-height:1.5;color:#a3a299;">${footnote ?? "You're receiving this because someone used this address with The Warm Sweep. If that wasn't you, you can ignore this email."}</p>
    </td></tr>
  </table></body></html>`;
  const text = [heading, "", intro, cta ? `\n${cta.label}: ${cta.url}` : "", outro ? `\n${outro}` : ""].filter(Boolean).join("\n");
  return { html, text };
}
