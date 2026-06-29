import { AuthForm } from "@/components/auth/AuthForm";

const NOTICES: Record<string, string> = {
  reset: "Password updated — sign in with your new password.",
  verified: "Email confirmed. Welcome aboard.",
  invalid: "That verification link is invalid or expired — sign in and we'll resend it.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string; verify?: string; verified?: string }>;
}) {
  const sp = await searchParams;
  const key = sp.reset ? "reset" : sp.verified ? "verified" : sp.verify === "invalid" ? "invalid" : null;
  return <AuthForm mode="sign-in" notice={key ? NOTICES[key] : null} />;
}
