import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

/**
 * DB-backed fixed-window rate limiter. Distributed (works across serverless
 * instances, unlike an in-memory Map). Best-effort: it fails OPEN on a DB hiccup
 * so a transient blip never locks people out of signing in.
 */
export async function rateLimit(key: string, max: number, windowMs: number): Promise<RateLimitResult> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - windowMs);
  try {
    const existing = await prisma.rateLimit.findUnique({ where: { key } });
    if (!existing || existing.windowStart < cutoff) {
      await prisma.rateLimit.upsert({
        where: { key },
        create: { key, count: 1, windowStart: now },
        update: { count: 1, windowStart: now },
      });
      return { allowed: true, remaining: max - 1 };
    }
    if (existing.count >= max) return { allowed: false, remaining: 0 };
    await prisma.rateLimit.update({ where: { key }, data: { count: { increment: 1 } } });
    return { allowed: true, remaining: max - existing.count - 1 };
  } catch (err) {
    console.error("[rate-limit] failing open:", err);
    return { allowed: true, remaining: max };
  }
}

/** Best-effort client IP from proxy headers (Vercel sets x-forwarded-for). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] || h.get("x-real-ip") || "unknown").trim();
}
