import { PrismaClient } from "@prisma/client";

// A single PrismaClient across hot reloads in dev (Next.js re-evaluates modules).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// Neon computes auto-suspend when idle, and Vercel serverless functions reuse a
// cached Prisma connection across invocations. After an idle gap that cached
// connection is dead, so the *first* query surfaces as
// "Error in PostgreSQL connection: Error { kind: Closed }" (or a Prisma P1001/
// P1017). Retrying transparently re-establishes a fresh connection (and wakes
// the compute), so a stale socket no longer turns a user action into a no-op.
const TRANSIENT_DB_ERROR =
  /kind:\s*Closed|connection.*(closed|reset)|ECONNRESET|terminating connection|server closed the connection|Can't reach database server|Closed\}/i;

function isTransientDbError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  const code = (e as { code?: string } | null)?.code;
  // P1001 can't reach DB, P1017 server closed connection, P2024 pool timeout.
  return TRANSIENT_DB_ERROR.test(msg) || code === "P1001" || code === "P1017" || code === "P2024";
}

/**
 * Run a DB operation, retrying only on transient connection drops (stale Neon
 * connection after idle/suspend). Non-transient errors — including domain
 * guards like DraftGuardError — propagate immediately, unchanged.
 */
export async function withDbRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (!isTransientDbError(e) || attempt === attempts - 1) throw e;
      lastErr = e;
      await new Promise((r) => setTimeout(r, 100 * 2 ** attempt)); // 100ms, 200ms
    }
  }
  throw lastErr;
}
