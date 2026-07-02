import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MicrosoftGraphProvider } from "@/lib/mailbox/microsoft";
import { encryptSecret } from "@/lib/crypto";
import { readVerifiedOAuthState, clearOAuthStateCookie } from "@/lib/auth/oauth-state";

// Microsoft Graph OAuth callback: exchange the code, ENCRYPT tokens, upsert the
// MICROSOFT mailbox scoped to the org in `state`.
export async function GET(req: NextRequest) {
  const base = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const session = await auth();
  if (!session?.user?.activeOrgId) return NextResponse.redirect(new URL("/sign-in", base));

  const code = req.nextUrl.searchParams.get("code");
  const stateRaw = req.nextUrl.searchParams.get("state");
  if (!code || !stateRaw) return NextResponse.redirect(new URL("/connections?error=missing_code", base));

  // CSRF: the state's nonce must match the cookie set at start (constant-time).
  const state = readVerifiedOAuthState(req, stateRaw);
  if (!state) {
    const res = NextResponse.redirect(new URL("/connections?error=bad_state", base));
    clearOAuthStateCookie(res);
    return res;
  }
  const orgId = state.orgId as string;
  const dest = state.ret === "welcome" ? "/welcome" : "/connections";
  if (orgId !== session.user.activeOrgId) {
    const res = NextResponse.redirect(new URL(`${dest}?error=org_mismatch`, base));
    clearOAuthStateCookie(res);
    return res;
  }

  try {
    const tokens = await new MicrosoftGraphProvider().exchangeCode(code);
    await prisma.mailbox.upsert({
      where: { orgId_email: { orgId, email: tokens.email } },
      create: {
        orgId,
        email: tokens.email,
        provider: "MICROSOFT",
        status: "CONNECTED",
        accessTokenEnc: encryptSecret(tokens.accessToken),
        refreshTokenEnc: tokens.refreshToken ? encryptSecret(tokens.refreshToken) : null,
        tokenExpiry: tokens.expiry,
      },
      update: {
        status: "CONNECTED",
        accessTokenEnc: encryptSecret(tokens.accessToken),
        refreshTokenEnc: tokens.refreshToken ? encryptSecret(tokens.refreshToken) : undefined,
        tokenExpiry: tokens.expiry,
      },
    });
    const res = NextResponse.redirect(new URL(`${dest}?connected=microsoft`, base));
    clearOAuthStateCookie(res);
    return res;
  } catch {
    const res = NextResponse.redirect(new URL(`${dest}?error=exchange_failed`, base));
    clearOAuthStateCookie(res);
    return res;
  }
}
