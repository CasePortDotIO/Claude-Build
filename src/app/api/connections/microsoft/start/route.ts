import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { MicrosoftGraphProvider, hasMicrosoftOAuth } from "@/lib/mailbox/microsoft";

export async function GET() {
  const session = await auth();
  if (!session?.user?.activeOrgId) return NextResponse.redirect(new URL("/sign-in", process.env.NEXTAUTH_URL));
  if (!hasMicrosoftOAuth()) {
    return NextResponse.redirect(new URL("/connections?error=microsoft_not_configured", process.env.NEXTAUTH_URL));
  }
  const state = Buffer.from(JSON.stringify({ orgId: session.user.activeOrgId })).toString("base64url");
  return NextResponse.redirect(new MicrosoftGraphProvider().getAuthUrl(state));
}
