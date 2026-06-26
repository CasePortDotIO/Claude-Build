import { describe, it, expect } from "vitest";
import {
  transition,
  canTransition,
  nextState,
  TERMINAL_STATES,
  IllegalTransitionError,
} from "@/lib/agent/state-machine";

describe("lead state machine", () => {
  it("walks the happy path NEW → BOOKED", () => {
    expect(transition("AWAITING_APPROVAL", "APPROVE")).toBe("SCHEDULED");
    expect(transition("SCHEDULED", "SEND")).toBe("SENT");
    expect(transition("SENT", "DELIVERED")).toBe("AWAITING_REPLY");
    expect(transition("AWAITING_REPLY", "REPLY")).toBe("REPLIED");
    expect(transition("REPLIED", "NEGOTIATE")).toBe("NEGOTIATING");
    expect(transition("NEGOTIATING", "BOOK")).toBe("BOOKED");
  });

  it("rejects illegal transitions", () => {
    expect(canTransition("NEW", "BOOK")).toBe(false);
    expect(nextState("BOOKED", "SEND")).toBeNull();
    expect(() => transition("SENT", "APPROVE")).toThrow(IllegalTransitionError);
  });

  it("allows opt-out from every active state", () => {
    for (const s of ["NEW", "AWAITING_APPROVAL", "SCHEDULED", "SENT", "AWAITING_REPLY", "REPLIED", "NEGOTIATING"] as const) {
      expect(canTransition(s, "OPT_OUT")).toBe(true);
      expect(transition(s, "OPT_OUT")).toBe("OPTED_OUT");
    }
  });

  it("treats bounce/opt-out/booked/DNC as terminal", () => {
    for (const s of ["BOUNCED", "OPTED_OUT", "BOOKED", "DO_NOT_CONTACT", "CLOSED_LOST"] as const) {
      expect(TERMINAL_STATES.has(s)).toBe(true);
    }
  });
});
