import type { Mailbox } from "@prisma/client";
import type { MailboxContext, MailboxProvider } from "@/lib/mailbox/types";
import { GmailProvider } from "@/lib/mailbox/gmail";
import { SimulationProvider } from "@/lib/mailbox/simulation";
import { MicrosoftGraphProvider, hasMicrosoftOAuth } from "@/lib/mailbox/microsoft";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { getSecret } from "@/lib/config/secrets";

export * from "@/lib/mailbox/types";
export { hasMicrosoftOAuth };

export async function hasGoogleOAuth(): Promise<boolean> {
  return Boolean((await getSecret("GOOGLE_CLIENT_ID")) && (await getSecret("GOOGLE_CLIENT_SECRET")));
}

/** Resolve a provider implementation for a mailbox kind. */
export function getMailboxProvider(kind: "GMAIL" | "MICROSOFT" | "SIMULATION"): MailboxProvider {
  switch (kind) {
    case "GMAIL":
      return new GmailProvider();
    case "SIMULATION":
      return new SimulationProvider();
    case "MICROSOFT":
      return new MicrosoftGraphProvider();
  }
}

/** Decrypt a stored mailbox's tokens into a provider call context. */
export function mailboxContext(mailbox: Mailbox): MailboxContext {
  return {
    email: mailbox.email,
    accessToken: mailbox.accessTokenEnc ? decryptSecret(mailbox.accessTokenEnc) : undefined,
    refreshToken: mailbox.refreshTokenEnc ? decryptSecret(mailbox.refreshTokenEnc) : undefined,
  };
}

/**
 * Like mailboxContext, but first refreshes the OAuth access token if it's expired
 * (or within 60s of it). Google/Microsoft access tokens last ~1 hour, so without
 * this every real send/poll would start failing an hour after connecting. The
 * new token is persisted (encrypted) so the refresh amortizes across calls. On
 * refresh failure we fall back to the stored token (the call will surface a clear
 * auth error rather than crash here).
 */
export async function getReadyContext(mailbox: Mailbox): Promise<MailboxContext> {
  const base = mailboxContext(mailbox);
  if (mailbox.provider === "SIMULATION") return base;

  const needsRefresh = !mailbox.tokenExpiry || mailbox.tokenExpiry.getTime() - Date.now() < 60_000;
  if (!needsRefresh || !mailbox.refreshTokenEnc) return base;

  const provider = getMailboxProvider(mailbox.provider);
  if (!provider.refresh) return base;

  try {
    const { accessToken, expiry } = await provider.refresh(decryptSecret(mailbox.refreshTokenEnc));
    await prisma.mailbox.update({
      where: { id: mailbox.id },
      data: { accessTokenEnc: encryptSecret(accessToken), tokenExpiry: expiry ?? null },
    });
    return { ...base, accessToken };
  } catch (err) {
    console.error(`[mailbox] token refresh failed for ${mailbox.email}:`, err);
    return base;
  }
}
