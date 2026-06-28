import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MicrosoftGraphProvider } from "@/lib/mailbox/microsoft";
import { encryptSecret } from "@/lib/crypto";

// Microsoft Graph OAuth callback: exchange the code, ENCRYPT tokens, upsert the
// MICROSOFT mailbox scoped to the org in `state`.
export async function GET(req: NextRequest) {
  const base = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const session = await auth();
  if (!session?.user?.activeOrgId) return NextResponse.redirect(new URL("/sign-in", base));

  const code = req.nextUrl.searchParams.get("code");
  const stateRaw = req.nextUrl.searchParams.get("state");
  if (!code || !stateRaw) return NextResponse.redirect(new URL("/connections?error=missing_code", base));

  let orgId: string;
  let dest = "/connections";
  try {
    const state = JSON.parse(Buffer.from(stateRaw, "base64url").toString());
    orgId = state.orgId;
    if (state.ret === "welcome") dest = "/welcome";
  } catch {
    return NextResponse.redirect(new URL("/connections?error=bad_state", base));
  }
  if (orgId !== session.user.activeOrgId) return NextResponse.redirect(new URL(`${dest}?error=org_mismatch`, base));

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
    return NextResponse.redirect(new URL(`${dest}?connected=microsoft`, base));
  } catch {
    return NextResponse.redirect(new URL(`${dest}?error=exchange_failed`, base));
  }
}
