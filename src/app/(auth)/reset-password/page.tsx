import Link from "next/link";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  if (!token) {
    return (
      <div className="ws-rise w-full max-w-[400px] text-center">
        <h1 className="m-0 mb-2 font-heading text-[22px] font-semibold text-ink">Invalid reset link</h1>
        <p className="m-0 mb-5 text-[14px] text-muted">This link is missing its token. Request a fresh one.</p>
        <Link href="/forgot-password" className="font-semibold text-sweep hover:underline">Request a new link →</Link>
      </div>
    );
  }
  return <ResetPasswordForm token={token} />;
}
