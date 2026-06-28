import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { MicrosoftGraphProvider, hasMicrosoftOAuth } from "@/lib/mailbox/microsoft";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.activeOrgId) return NextResponse.redirect(new URL("/sign-in", process.env.NEXTAUTH_URL));
  const ret = req.nextUrl.searchParams.get("return") === "welcome" ? "welcome" : undefined;
  const fallback = ret === "welcome" ? "/welcome" : "/connections";
  if (!hasMicrosoftOAuth()) {
    return NextResponse.redirect(new URL(`${fallback}?error=microsoft_not_configured`, process.env.NEXTAUTH_URL));
  }
  const state = Buffer.from(JSON.stringify({ orgId: session.user.activeOrgId, ret })).toString("base64url");
  return NextResponse.redirect(new MicrosoftGraphProvider().getAuthUrl(state));
}
