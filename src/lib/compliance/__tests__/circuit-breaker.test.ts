import { describe, it, expect } from "vitest";
import { autoPauseDecision, rateAlert, CAP_LIMITS } from "@/lib/compliance/caps";
import type { Mailbox } from "@prisma/client";

// Minimal mailbox factory for threshold math.
function mb(over: Partial<Mailbox>): Mailbox {
  return {
    sentTotal: 1000,
    bounceCount: 0,
    complaintCount: 0,
    dailyCap: 500,
    ...over,
  } as Mailbox;
}

describe("§4 two-tier deliverability thresholds", () => {
  it("does not alert or pause below the minimum volume", () => {
    const m = mb({ sentTotal: 5, bounceCount: 5 });
    expect(autoPauseDecision(m).pause).toBe(false);
    expect(rateAlert(m).level).toBe("ok");
  });

  it("alerts at 2% bounce but does not hard-stop until 5%", () => {
    const alerting = mb({ bounceCount: 30 }); // 3%
    expect(rateAlert(alerting).level).toBe("alert");
    expect(autoPauseDecision(alerting).pause).toBe(false);

    const hard = mb({ bounceCount: 60 }); // 6%
    expect(autoPauseDecision(hard).pause).toBe(true);
  });

  it("alerts at 0.1% complaints, hard-stops at 0.3%", () => {
    const alerting = mb({ complaintCount: 2 }); // 0.2%
    expect(rateAlert(alerting).level).toBe("alert");
    expect(autoPauseDecision(alerting).pause).toBe(false);

    const hard = mb({ complaintCount: 4 }); // 0.4%
    expect(autoPauseDecision(hard).pause).toBe(true);
  });

  it("exposes the alert and hard-stop limits as distinct values", () => {
    expect(CAP_LIMITS.BOUNCE_ALERT).toBeLessThan(CAP_LIMITS.BOUNCE_HARDSTOP);
    expect(CAP_LIMITS.COMPLAINT_ALERT).toBeLessThan(CAP_LIMITS.COMPLAINT_HARDSTOP);
  });
});
