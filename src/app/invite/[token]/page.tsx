import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { hashToken } from "@/lib/auth/tokens";
import { AcceptInvite } from "@/components/account/AcceptInvite";

/**
 * Public invitation landing page. Loads the invite, then routes by auth state:
 * signed in with the matching email → accept; otherwise sign in / sign up first.
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await prisma.invitation.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { org: { select: { name: true, brandName: true } } },
  });

  const valid = invite && !invite.acceptedAt && invite.expiresAt > new Date();
  const orgName = invite ? invite.org.brandName || invite.org.name : "the team";
  const session = await auth();
  const sessionEmail = session?.user?.email ?? null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-parchment px-6 py-12">
      <div className="ws-rise w-full max-w-[420px] rounded-xl2 border border-line bg-white p-8 text-center shadow-pop">
        <p className="m-0 mb-1 font-heading text-[14px] font-semibold text-sweep">The Warm Sweep&trade;</p>

        {!valid ? (
          <>
            <h1 className="m-0 mb-2 mt-3 font-heading text-[22px] font-semibold text-ink">Invitation not available</h1>
            <p className="m-0 mb-6 text-[14px] leading-[1.55] text-muted">
              {invite?.acceptedAt ? "This invitation has already been accepted." : "This invitation is invalid or has expired. Ask your admin to send a new one."}
            </p>
            <Link href="/sign-in" className="font-semibold text-sweep hover:underline">Go to sign in →</Link>
          </>
        ) : !sessionEmail ? (
          <>
            <h1 className="m-0 mb-2 mt-3 font-heading text-[22px] font-semibold text-ink">Join {orgName}</h1>
            <p className="m-0 mb-6 text-[14px] leading-[1.55] text-muted">
              You&apos;ve been invited as <span className="font-semibold text-ink">{invite!.email}</span>. Sign in or create your account with that email to accept.
            </p>
            <div className="flex flex-col gap-2.5">
              <Link href={`/sign-in?callbackUrl=/invite/${token}`} className="rounded-lg bg-ember px-5 py-3 font-heading text-[14.5px] font-semibold text-white hover:bg-ember-hover">Sign in to accept</Link>
              <Link href="/sign-up" className="rounded-lg border border-line-3 bg-white px-5 py-3 text-[14.5px] font-semibold text-muted hover:bg-cream">Create an account</Link>
            </div>
          </>
        ) : sessionEmail.toLowerCase() !== invite!.email.toLowerCase() ? (
          <>
            <h1 className="m-0 mb-2 mt-3 font-heading text-[22px] font-semibold text-ink">Wrong account</h1>
            <p className="m-0 mb-6 text-[14px] leading-[1.55] text-muted">
              This invitation is for <span className="font-semibold text-ink">{invite!.email}</span>, but you&apos;re signed in as {sessionEmail}. Sign out and use the invited email.
            </p>
            <Link href="/sign-in" className="font-semibold text-sweep hover:underline">Switch account →</Link>
          </>
        ) : (
          <>
            <h1 className="m-0 mb-2 mt-3 font-heading text-[22px] font-semibold text-ink">Join {orgName}</h1>
            <p className="m-0 mb-6 text-[14px] leading-[1.55] text-muted">You&apos;re invited to {orgName}&apos;s workspace. Accept to get access.</p>
            <AcceptInvite token={token} orgName={orgName} />
          </>
        )}
      </div>
    </div>
  );
}
