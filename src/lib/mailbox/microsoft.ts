import type {
  MailboxProvider,
  MailboxContext,
  OutboundEmail,
  SendResult,
  InboundEmail,
  OAuthTokens,
} from "@/lib/mailbox/types";

/**
 * Microsoft 365 / Outlook via Microsoft Graph. Used when a MICROSOFT mailbox is
 * connected (MICROSOFT_CLIENT_ID/SECRET configured). OAuth via the Microsoft
 * identity platform; tokens encrypted by the caller. Mirrors the Gmail provider
 * so it slots behind the same MailboxProvider interface.
 */
const GRAPH = "https://graph.microsoft.com/v1.0";
const SCOPES = ["Mail.Send", "Mail.Read", "User.Read", "offline_access"];

function redirectUri(): string {
  const base = process.env.NEXTAUTH_URL || "http://localhost:3000";
  return `${base}/api/connections/microsoft/callback`;
}

export function hasMicrosoftOAuth(): boolean {
  return Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET);
}

export class MicrosoftGraphProvider implements MailboxProvider {
  readonly kind = "MICROSOFT" as const;

  getAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID ?? "",
      response_type: "code",
      redirect_uri: redirectUri(),
      response_mode: "query",
      scope: SCOPES.join(" "),
      state,
    });
    return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<OAuthTokens> {
    const res = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.MICROSOFT_CLIENT_ID ?? "",
        client_secret: process.env.MICROSOFT_CLIENT_SECRET ?? "",
        code,
        redirect_uri: redirectUri(),
        grant_type: "authorization_code",
        scope: SCOPES.join(" "),
      }),
    });
    if (!res.ok) throw new Error(`Microsoft token exchange failed: ${res.status} ${await res.text()}`);
    const tok = (await res.json()) as { access_token: string; refresh_token?: string; expires_in?: number };

    const me = await fetch(`${GRAPH}/me`, { headers: { authorization: `Bearer ${tok.access_token}` } });
    const email = me.ok ? ((await me.json()) as { mail?: string; userPrincipalName?: string }).mail ?? "unknown" : "unknown";

    return {
      email,
      accessToken: tok.access_token,
      refreshToken: tok.refresh_token,
      expiry: tok.expires_in ? new Date(Date.now() + tok.expires_in * 1000) : undefined,
    };
  }

  async send(ctx: MailboxContext, email: OutboundEmail): Promise<SendResult> {
    const headers: { name: string; value: string }[] = [];
    if (email.listUnsubscribeUrl) {
      const post = email.listUnsubscribeUrl.replace("/u/", "/api/unsubscribe/");
      headers.push({ name: "List-Unsubscribe", value: `<${post}>, <${email.listUnsubscribeUrl}>` });
      headers.push({ name: "List-Unsubscribe-Post", value: "List-Unsubscribe=One-Click" });
    }
    const res = await fetch(`${GRAPH}/me/sendMail`, {
      method: "POST",
      headers: { authorization: `Bearer ${ctx.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({
        message: {
          subject: email.subject,
          body: { contentType: "Text", content: email.body },
          toRecipients: [{ emailAddress: { address: email.to } }],
          internetMessageHeaders: headers.length ? headers : undefined,
        },
        saveToSentItems: true,
      }),
    });
    if (!res.ok) throw new Error(`Microsoft sendMail failed: ${res.status} ${await res.text()}`);
    // Graph sendMail returns 202 with no id; use a synthetic id + thread by conversation.
    return { providerMessageId: `msg-${Date.now()}`, threadId: email.threadId ?? `msthread-${Date.now()}` };
  }

  async fetchNewMessages(ctx: MailboxContext): Promise<{ messages: InboundEmail[]; cursor?: string }> {
    const url = `${GRAPH}/me/mailFolders/inbox/messages?$top=25&$select=id,conversationId,from,toRecipients,subject,bodyPreview,receivedDateTime`;
    const res = await fetch(url, { headers: { authorization: `Bearer ${ctx.accessToken}` } });
    if (!res.ok) throw new Error(`Microsoft fetch failed: ${res.status}`);
    const json = (await res.json()) as {
      value?: {
        id: string;
        conversationId: string;
        from?: { emailAddress?: { address?: string } };
        toRecipients?: { emailAddress?: { address?: string } }[];
        subject?: string;
        bodyPreview?: string;
        receivedDateTime?: string;
      }[];
    };
    const messages: InboundEmail[] = (json.value ?? []).map((m) => ({
      providerMessageId: m.id,
      threadId: m.conversationId,
      fromEmail: m.from?.emailAddress?.address ?? "",
      toEmail: m.toRecipients?.[0]?.emailAddress?.address ?? "",
      subject: m.subject ?? "",
      body: m.bodyPreview ?? "",
      receivedAt: m.receivedDateTime ? new Date(m.receivedDateTime) : new Date(),
    }));
    return { messages };
  }
}
