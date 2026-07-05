/**
 * Entitlement error — thrown when an org tries to use a capability its tier
 * doesn't include (a second list on a single-list plan, always-on autopilot on a
 * one-shot plan, another client past the reseller cap). Lives in its own module
 * so the pure policy layer and the DB-touching gate can share it without a cycle.
 * Callers catch this and return an upsell-framed message — never crash.
 */
export class EntitlementError extends Error {
  readonly capability: string;
  constructor(message: string, capability: string) {
    super(message);
    this.name = "EntitlementError";
    this.capability = capability;
  }
}
