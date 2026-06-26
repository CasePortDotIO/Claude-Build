import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { GmailProvider } from "@/lib/mailbox/gmail";
import { hasGoogleOAuth } from "@/lib/mailbox";

// Kick off Gmail OAuth. State carries the active orgId so the callback can scope
// the connected mailbox. Requires GOOGLE_CLIENT_ID/SECRET to be configured.
export async function GET() {
  const session = await auth();
  if (!session?.user?.activeOrgId) return NextResponse.redirect(new URL("/sign-in", process.env.NEXTAUTH_URL));
  if (!hasGoogleOAuth()) {
    return NextResponse.redirect(new URL("/connections?error=google_not_configured", process.env.NEXTAUTH_URL));
  }
  const state = Buffer.from(JSON.stringify({ orgId: session.user.activeOrgId })).toString("base64url");
  const url = new GmailProvider().getAuthUrl(state);
  return NextResponse.redirect(url);
}
