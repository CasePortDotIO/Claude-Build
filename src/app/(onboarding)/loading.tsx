import { Skeleton } from "@/components/ui/Skeleton";

// Shown while the onboarding wizard's server component resolves. A centered card
// outline keeps the focused setup flow feeling instant instead of blank.
export default function OnboardingLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-[560px] rounded-xl2 border border-line bg-white p-8 shadow-card">
        <Skeleton className="mb-3 h-4 w-32" />
        <Skeleton className="mb-2 h-7 w-3/4" delayMs={60} />
        <Skeleton className="mb-7 h-4 w-full" delayMs={120} />
        <div className="flex flex-col gap-3">
          <Skeleton className="h-14 w-full rounded-xl2" delayMs={160} />
          <Skeleton className="h-14 w-full rounded-xl2" delayMs={220} />
        </div>
        <Skeleton className="mt-7 h-11 w-40 rounded-lg" delayMs={280} />
      </div>
    </div>
  );
}
