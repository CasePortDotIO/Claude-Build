import { randomUUID } from "node:crypto";
import type { MailboxProvider, MailboxContext, OutboundEmail, SendResult, InboundEmail } from "@/lib/mailbox/types";

/**
 * Offline mailbox for dev/demo. "Sends" by minting provider ids without hitting
 * the network, so the entire send → reply → negotiate loop is runnable with no
 * Google credentials. Inbound replies are injected explicitly through the
 * ingestion pipeline's simulate-reply path rather than polled here, so
 * fetchNewMessages is a no-op.
 */
export class SimulationProvider implements MailboxProvider {
  readonly kind = "SIMULATION" as const;

  async send(_ctx: MailboxContext, email: OutboundEmail): Promise<SendResult> {
    return {
      providerMessageId: `sim-${randomUUID()}`,
      threadId: email.threadId ?? `simthread-${randomUUID()}`,
    };
  }

  async fetchNewMessages(): Promise<{ messages: InboundEmail[]; cursor?: string }> {
    // Simulated inbound is injected via simulateInboundReply(), not polled.
    return { messages: [] };
  }
}

/**
 * Generate a realistic, deterministic-enough positive reply from a "lead" for
 * the simulation. Grounded in the lead's first name + goal so the thread reads
 * naturally in the Conversations UI. Kept rule-based (no LLM call) so it's free
 * and works offline.
 */
export function simulatedLeadReply(opts: { firstName?: string | null; goal?: string | null; positive?: boolean }): string {
  const name = opts.firstName || "there";
  if (opts.positive === false) {
    return `Thanks for reaching out, but the timing isn't right for me at the moment. I'll reach back out if that changes.`;
  }
  const goalBit = opts.goal ? ` ${opts.goal} is still very much on my mind.` : "";
  return `Hi,\n\nGood timing — yes, I'm still interested.${goalBit} A quick call could work. What times do you have this week?\n\nThanks,\n${name}`;
}
