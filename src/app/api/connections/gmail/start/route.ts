import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { GmailProvider } from "@/lib/mailbox/gmail";
import { hasGoogleOAuth } from "@/lib/mailbox";

// Kick off Gmail OAuth. State carries the active orgId (so the callback can scope
// the connected mailbox) and an optional return target so the onboarding wizard
// gets the user back to /welcome instead of /connections.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.activeOrgId) return NextResponse.redirect(new URL("/sign-in", process.env.NEXTAUTH_URL));
  const ret = req.nextUrl.searchParams.get("return") === "welcome" ? "welcome" : undefined;
  const fallback = ret === "welcome" ? "/welcome" : "/connections";
  if (!(await hasGoogleOAuth())) {
    return NextResponse.redirect(new URL(`${fallback}?error=google_not_configured`, process.env.NEXTAUTH_URL));
  }
  const state = Buffer.from(JSON.stringify({ orgId: session.user.activeOrgId, ret })).toString("base64url");
  const url = await new GmailProvider().getAuthUrl(state);
  return NextResponse.redirect(url);
}
