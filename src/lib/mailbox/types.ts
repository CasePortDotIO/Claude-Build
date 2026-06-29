// The MailboxProvider adapter interface (§6). New providers (Microsoft Graph in
// M7) drop in behind this without touching the agent loop. GmailProvider is the
// real implementation; SimulationProvider runs the whole loop offline.

export interface OAuthTokens {
  email: string;
  accessToken: string;
  refreshToken?: string;
  expiry?: Date;
}

export interface OutboundEmail {
  to: string;
  subject: string;
  body: string;
  // Threading: when replying within an existing thread.
  threadId?: string | null;
  inReplyTo?: string | null;
  // RFC 8058 one-click unsubscribe target (§9). Set as List-Unsubscribe header.
  listUnsubscribeUrl?: string | null;
}

export interface SendResult {
  providerMessageId: string;
  threadId: string;
}

export interface InboundEmail {
  providerMessageId: string;
  threadId: string;
  inReplyTo?: string | null;
  fromEmail: string;
  toEmail: string;
  subject: string;
  body: string;
  receivedAt: Date;
}

// A mailbox's decrypted auth context, passed to provider calls.
export interface MailboxContext {
  email: string;
  accessToken?: string;
  refreshToken?: string;
}

export interface MailboxProvider {
  readonly kind: "GMAIL" | "MICROSOFT" | "SIMULATION";

  // --- OAuth (real providers) ---
  getAuthUrl?(state: string): string;
  exchangeCode?(code: string): Promise<OAuthTokens>;
  // Exchange a refresh token for a fresh access token (real providers only).
  refresh?(refreshToken: string): Promise<{ accessToken: string; expiry?: Date }>;

  // --- Send ---
  send(ctx: MailboxContext, email: OutboundEmail): Promise<SendResult>;

  // --- Read replies (incremental) ---
  fetchNewMessages(ctx: MailboxContext, cursor?: string | null): Promise<{ messages: InboundEmail[]; cursor?: string }>;
}

// ── Inbound classification helpers (§6: parse out auto-replies + bounces) ────

const AUTO_REPLY_RE = /\b(out of office|auto[- ]?reply|automatic reply|away from my|on vacation|on holiday|will be back|currently away)\b/i;
const BOUNCE_RE = /\b(mailer-daemon|delivery status notification|undeliverable|delivery has failed|address not found|recipient.*rejected|550 5\.|permanent failure)\b/i;
const OPT_OUT_RE = /\b(unsubscribe|opt[- ]?out|stop emailing|remove me|take me off|don'?t (?:email|contact) me|please stop)\b/i;

export function classifyInbound(email: Pick<InboundEmail, "fromEmail" | "subject" | "body">): {
  isAutoReply: boolean;
  isBounce: boolean;
  isOptOut: boolean;
} {
  const hay = `${email.subject}\n${email.body}`;
  const from = email.fromEmail.toLowerCase();
  const isBounce = BOUNCE_RE.test(hay) || from.includes("mailer-daemon") || from.includes("postmaster");
  const isAutoReply = !isBounce && AUTO_REPLY_RE.test(hay);
  // A single-word "stop" reply also counts as opt-out (we tell them to reply 'stop').
  const isOptOut = !isBounce && (OPT_OUT_RE.test(hay) || /^\s*stop\.?\s*$/i.test(email.body));
  return { isAutoReply, isBounce, isOptOut };
}
