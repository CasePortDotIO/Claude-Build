/**
 * Draft guard error — thrown when a lead can't/shouldn't be drafted (suppressed,
 * opted-out, terminal, or over the plan's throughput cap). Lives in its own
 * module so the meter and the draft pipeline can share it without a cycle.
 * Callers (autopilot, follow-ups) catch this to SKIP a lead, never to crash.
 */
export class DraftGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DraftGuardError";
  }
}
