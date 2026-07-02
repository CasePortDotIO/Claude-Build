import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { MicrosoftGraphProvider, hasMicrosoftOAuth } from "@/lib/mailbox/microsoft";
import { buildOAuthState, setOAuthStateCookie } from "@/lib/auth/oauth-state";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.activeOrgId) return NextResponse.redirect(new URL("/sign-in", process.env.NEXTAUTH_URL));
  const ret = req.nextUrl.searchParams.get("return") === "welcome" ? "welcome" : undefined;
  const fallback = ret === "welcome" ? "/welcome" : "/connections";
  if (!(await hasMicrosoftOAuth())) {
    return NextResponse.redirect(new URL(`${fallback}?error=microsoft_not_configured`, process.env.NEXTAUTH_URL));
  }
  const { state, nonce } = buildOAuthState({ orgId: session.user.activeOrgId, ret });
  const res = NextResponse.redirect(await new MicrosoftGraphProvider().getAuthUrl(state));
  setOAuthStateCookie(res, nonce);
  return res;
}
