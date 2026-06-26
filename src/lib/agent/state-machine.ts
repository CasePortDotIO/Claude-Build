import type { LeadStatus } from "@prisma/client";

/**
 * The lead state machine (§3), made explicit rather than implied by scattered
 * `update({ status })` calls. Each milestone's pipeline asks this module whether
 * a transition is legal and what the next state is, so the lifecycle is one
 * auditable source of truth.
 *
 *   NEW → RESEARCHED → DRAFTED → AWAITING_APPROVAL → SCHEDULED → SENT →
 *   AWAITING_REPLY → REPLIED → NEGOTIATING → BOOKED (terminal)
 * with branches: BOUNCED, OPTED_OUT, DO_NOT_CONTACT, COOLED (re-queue), CLOSED_LOST.
 */

export type LeadEvent =
  | "RESEARCH" // gathered memory
  | "DRAFT" // produced a draft
  | "QUEUE_APPROVAL" // draft awaiting human
  | "APPROVE" // human approved → scheduled to send
  | "REJECT" // human rejected → back to researched
  | "SEND" // email left the mailbox
  | "DELIVERED" // accepted by recipient server
  | "REPLY" // a genuine reply arrived
  | "NEGOTIATE" // agent is handling the back-and-forth
  | "BOOK" // a call was booked (terminal success)
  | "BOUNCE" // hard bounce
  | "OPT_OUT" // unsubscribe / "stop"
  | "DO_NOT_CONTACT" // manual DNC
  | "COOL" // went quiet → re-queue later
  | "CLOSE_LOST"; // gave up

// Allowed (from → event → to). Anything not listed is illegal.
const TRANSITIONS: Partial<Record<LeadStatus, Partial<Record<LeadEvent, LeadStatus>>>> = {
  NEW: { RESEARCH: "RESEARCHED", DRAFT: "DRAFTED", QUEUE_APPROVAL: "AWAITING_APPROVAL", DO_NOT_CONTACT: "DO_NOT_CONTACT", OPT_OUT: "OPTED_OUT" },
  RESEARCHED: { DRAFT: "DRAFTED", QUEUE_APPROVAL: "AWAITING_APPROVAL", DO_NOT_CONTACT: "DO_NOT_CONTACT", OPT_OUT: "OPTED_OUT" },
  DRAFTED: { QUEUE_APPROVAL: "AWAITING_APPROVAL", DO_NOT_CONTACT: "DO_NOT_CONTACT" },
  AWAITING_APPROVAL: { APPROVE: "SCHEDULED", REJECT: "RESEARCHED", DO_NOT_CONTACT: "DO_NOT_CONTACT", OPT_OUT: "OPTED_OUT" },
  SCHEDULED: { SEND: "SENT", REJECT: "RESEARCHED", DO_NOT_CONTACT: "DO_NOT_CONTACT", OPT_OUT: "OPTED_OUT" },
  SENT: { DELIVERED: "AWAITING_REPLY", REPLY: "REPLIED", BOUNCE: "BOUNCED", OPT_OUT: "OPTED_OUT", COOL: "COOLED" },
  AWAITING_REPLY: { REPLY: "REPLIED", BOUNCE: "BOUNCED", OPT_OUT: "OPTED_OUT", COOL: "COOLED", CLOSE_LOST: "CLOSED_LOST" },
  REPLIED: { NEGOTIATE: "NEGOTIATING", BOOK: "BOOKED", OPT_OUT: "OPTED_OUT", QUEUE_APPROVAL: "AWAITING_APPROVAL", CLOSE_LOST: "CLOSED_LOST" },
  NEGOTIATING: { BOOK: "BOOKED", REPLY: "REPLIED", QUEUE_APPROVAL: "AWAITING_APPROVAL", OPT_OUT: "OPTED_OUT", COOL: "COOLED", CLOSE_LOST: "CLOSED_LOST" },
  // re-queue path
  COOLED: { DRAFT: "DRAFTED", QUEUE_APPROVAL: "AWAITING_APPROVAL", CLOSE_LOST: "CLOSED_LOST", OPT_OUT: "OPTED_OUT" },
  // terminal / branch states have no outgoing transitions (except none)
};

// Terminal states — no further outreach happens from here.
export const TERMINAL_STATES: ReadonlySet<LeadStatus> = new Set<LeadStatus>([
  "BOOKED",
  "OPTED_OUT",
  "DO_NOT_CONTACT",
  "BOUNCED",
  "CLOSED_LOST",
]);

export function canTransition(from: LeadStatus, event: LeadEvent): boolean {
  return Boolean(TRANSITIONS[from]?.[event]);
}

export function nextState(from: LeadStatus, event: LeadEvent): LeadStatus | null {
  return TRANSITIONS[from]?.[event] ?? null;
}

export class IllegalTransitionError extends Error {
  constructor(from: LeadStatus, event: LeadEvent) {
    super(`Illegal lead transition: ${from} --${event}-->`);
    this.name = "IllegalTransitionError";
  }
}

/** Resolve the next state, throwing if the transition isn't allowed. */
export function transition(from: LeadStatus, event: LeadEvent): LeadStatus {
  const to = nextState(from, event);
  if (!to) throw new IllegalTransitionError(from, event);
  return to;
}
