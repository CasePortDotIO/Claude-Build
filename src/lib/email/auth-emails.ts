import { sendTransactionalEmail, renderEmail } from "@/lib/email/transactional";

/** Absolute base URL — same convention as the OAuth/webhook code. */
function baseUrl(): string {
  return process.env.NEXTAUTH_URL || "http://localhost:3000";
}

export async function sendPasswordResetEmail(to: string, rawToken: string) {
  const url = `${baseUrl()}/reset-password?token=${rawToken}`;
  const { html, text } = renderEmail({
    heading: "Reset your password",
    intro: "We got a request to reset your Warm Sweep password. Click below to choose a new one — this link expires in 1 hour.",
    cta: { label: "Reset password", url },
    outro: "If you didn't request this, you can safely ignore this email — your password won't change.",
  });
  return sendTransactionalEmail({ to, subject: "Reset your Warm Sweep password", html, text });
}

export async function sendVerificationEmail(to: string, rawToken: string) {
  const url = `${baseUrl()}/api/auth/verify?token=${rawToken}`;
  const { html, text } = renderEmail({
    heading: "Confirm your email",
    intro: "Welcome to The Warm Sweep. Confirm this is your email so we can keep your account secure and send you booking alerts.",
    cta: { label: "Confirm email", url },
    outro: "This link expires in 24 hours. If you didn't create an account, you can ignore this email.",
  });
  return sendTransactionalEmail({ to, subject: "Confirm your email · The Warm Sweep", html, text });
}
