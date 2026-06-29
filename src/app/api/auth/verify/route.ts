import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { consumeAuthToken } from "@/lib/auth/tokens";

/**
 * One-click email verification. The link in the verification email points here;
 * a valid token marks the user verified and bounces them into the app.
 */
export async function GET(req: NextRequest) {
  const base = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const userId = await consumeAuthToken(token, "EMAIL_VERIFY");
  if (!userId) return NextResponse.redirect(new URL("/sign-in?verify=invalid", base));
  await prisma.user.update({ where: { id: userId }, data: { emailVerified: new Date() } });
  return NextResponse.redirect(new URL("/?verified=1", base));
}
