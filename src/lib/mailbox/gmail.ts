import type {
  MailboxProvider,
  MailboxContext,
  OutboundEmail,
  SendResult,
  InboundEmail,
  OAuthTokens,
} from "@/lib/mailbox/types";

/**
 * Real Gmail provider (Gmail API + Google OAuth). Used when GOOGLE_CLIENT_ID /
 * GOOGLE_CLIENT_SECRET are configured. Tokens are encrypted before storage by
 * the caller (lib/crypto); this module only handles the wire protocol.
 *
 * Scopes: gmail.send + gmail.readonly (read replies via history/threads).
 */
const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];

function redirectUri(): string {
  const base = process.env.NEXTAUTH_URL || "http://localhost:3000";
  return `${base}/api/connections/gmail/callback`;
}

export class GmailProvider implements MailboxProvider {
  readonly kind = "GMAIL" as const;

  getAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      redirect_uri: redirectUri(),
      response_type: "code",
      scope: GMAIL_SCOPES.join(" "),
      access_type: "offline",
      prompt: "consent",
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<OAuthTokens> {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID ?? "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        redirect_uri: redirectUri(),
        grant_type: "authorization_code",
      }),
    });
    if (!res.ok) throw new Error(`Google token exchange failed: ${res.status} ${await res.text()}`);
    const tok = (await res.json()) as { access_token: string; refresh_token?: string; expires_in?: number };

    // Resolve the connected address.
    const profile = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { authorization: `Bearer ${tok.access_token}` },
    });
    const email = profile.ok ? ((await profile.json()) as { email: string }).email : "unknown";

    return {
      email,
      accessToken: tok.access_token,
      refreshToken: tok.refresh_token,
      expiry: tok.expires_in ? new Date(Date.now() + tok.expires_in * 1000) : undefined,
    };
  }

  async send(ctx: MailboxContext, email: OutboundEmail): Promise<SendResult> {
    // RFC 2822 message, base64url-encoded, via the Gmail send endpoint.
    const unsubUrl = email.listUnsubscribeUrl;
    // Derive the RFC 8058 one-click POST endpoint from the GET page URL.
    const unsubPost = unsubUrl ? unsubUrl.replace("/u/", "/api/unsubscribe/") : "";
    const headers = [
      `From: ${ctx.email}`,
      `To: ${email.to}`,
      `Subject: ${email.subject}`,
      email.inReplyTo ? `In-Reply-To: ${email.inReplyTo}` : "",
      email.inReplyTo ? `References: ${email.inReplyTo}` : "",
      // List-Unsubscribe enables the native one-click unsubscribe button (§9).
      unsubUrl ? `List-Unsubscribe: <${unsubPost}>, <${unsubUrl}>` : "",
      unsubUrl ? "List-Unsubscribe-Post: List-Unsubscribe=One-Click" : "",
      "Content-Type: text/plain; charset=UTF-8",
    ].filter(Boolean);
    const raw = `${headers.join("\r\n")}\r\n\r\n${email.body}`;
    const encoded = Buffer.from(raw).toString("base64url");

    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { authorization: `Bearer ${ctx.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ raw: encoded, threadId: email.threadId ?? undefined }),
    });
    if (!res.ok) throw new Error(`Gmail send failed: ${res.status} ${await res.text()}`);
    const sent = (await res.json()) as { id: string; threadId: string };
    return { providerMessageId: sent.id, threadId: sent.threadId };
  }

  async fetchNewMessages(
    ctx: MailboxContext,
    cursor?: string | null,
  ): Promise<{ messages: InboundEmail[]; cursor?: string }> {
    // Incremental: list messages newer than the stored historyId. (Full history
    // diffing is elaborated in M5; this lists recent inbound and filters by date.)
    const q = encodeURIComponent("in:inbox newer_than:7d");
    const list = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${q}`, {
      headers: { authorization: `Bearer ${ctx.accessToken}` },
    });
    if (!list.ok) throw new Error(`Gmail list failed: ${list.status}`);
    const { messages = [] } = (await list.json()) as { messages?: { id: string }[] };

    const out: InboundEmail[] = [];
    for (const m of messages.slice(0, 25)) {
      const full = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`, {
        headers: { authorization: `Bearer ${ctx.accessToken}` },
      });
      if (!full.ok) continue;
      out.push(parseGmailMessage((await full.json()) as GmailMessage));
    }
    return { messages: out, cursor: cursor ?? undefined };
  }
}

interface GmailMessage {
  id: string;
  threadId: string;
  internalDate?: string;
  payload?: { headers?: { name: string; value: string }[]; parts?: GmailPart[]; body?: { data?: string } };
}
interface GmailPart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
}

function header(msg: GmailMessage, name: string): string {
  return msg.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}
function extractBody(part?: GmailPart | GmailMessage["payload"]): string {
  if (!part) return "";
  if ("body" in part && part.body?.data) return Buffer.from(part.body.data, "base64url").toString("utf8");
  const parts = (part as GmailPart).parts;
  if (parts) {
    const text = parts.find((p) => p.mimeType === "text/plain");
    if (text?.body?.data) return Buffer.from(text.body.data, "base64url").toString("utf8");
  }
  return "";
}

function parseGmailMessage(msg: GmailMessage): InboundEmail {
  return {
    providerMessageId: msg.id,
    threadId: msg.threadId,
    inReplyTo: header(msg, "In-Reply-To") || null,
    fromEmail: header(msg, "From"),
    toEmail: header(msg, "To"),
    subject: header(msg, "Subject"),
    body: extractBody(msg.payload),
    receivedAt: msg.internalDate ? new Date(Number(msg.internalDate)) : new Date(),
  };
}
