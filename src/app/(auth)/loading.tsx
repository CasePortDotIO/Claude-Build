import { Skeleton } from "@/components/ui/Skeleton";

// Shown while an auth page's server component resolves. Mirrors the form column
// of the split-screen shell (the brand panel lives in the layout and stays put),
// so the transition is a calm fade rather than a blank flash.
export default function AuthLoading() {
  return (
    <div className="w-full max-w-[380px]">
      <Skeleton className="mb-6 h-7 w-7 rounded-[10px]" />
      <Skeleton className="mb-2 h-7 w-3/5" />
      <Skeleton className="mb-7 h-4 w-4/5" delayMs={60} />
      <div className="flex flex-col gap-4">
        <Skeleton className="h-11 w-full rounded-lg" delayMs={120} />
        <Skeleton className="h-11 w-full rounded-lg" delayMs={180} />
        <Skeleton className="mt-1 h-11 w-full rounded-lg" delayMs={240} />
      </div>
      <Skeleton className="mx-auto mt-6 h-3.5 w-1/2" delayMs={300} />
    </div>
  );
}
