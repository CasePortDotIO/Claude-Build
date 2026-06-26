import type { Mailbox } from "@prisma/client";
import type { MailboxContext, MailboxProvider } from "@/lib/mailbox/types";
import { GmailProvider } from "@/lib/mailbox/gmail";
import { SimulationProvider } from "@/lib/mailbox/simulation";
import { decryptSecret } from "@/lib/crypto";

export * from "@/lib/mailbox/types";

export function hasGoogleOAuth(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/** Resolve a provider implementation for a mailbox kind. */
export function getMailboxProvider(kind: "GMAIL" | "MICROSOFT" | "SIMULATION"): MailboxProvider {
  switch (kind) {
    case "GMAIL":
      return new GmailProvider();
    case "SIMULATION":
      return new SimulationProvider();
    case "MICROSOFT":
      throw new Error("Microsoft Graph mailbox lands in M7.");
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
