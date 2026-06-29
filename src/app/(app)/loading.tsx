import { SkeletonCard } from "@/components/ui/Skeleton";

// Shown automatically by Next while any (app) page's server component fetches.
// The sidebar (in the layout) stays put; this fills the main area with a calm
// skeleton so navigation feels instant instead of blank.
export default function AppLoading() {
  return (
    <>
      <div className="sticky top-0 z-30 flex h-[66px] items-center justify-between border-b border-[#e7e1d6] bg-[rgba(250,247,242,0.86)] px-4 pl-16 backdrop-blur-md lg:px-[34px]">
        <SkeletonCard className="h-5 w-44 rounded-md" />
        <SkeletonCard className="h-9 w-28 rounded-lg" />
      </div>
      <div className="flex-1 px-4 pb-[60px] pt-[30px] lg:px-[34px]">
        {/* KPI row */}
        <div className="mb-[22px] grid grid-cols-1 gap-[18px] md:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <SkeletonCard key={i} className="h-[116px]" delayMs={i * 80} />
          ))}
        </div>
        {/* split content */}
        <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-[1.45fr_1fr]">
          <SkeletonCard className="h-[300px]" />
          <SkeletonCard className="h-[300px]" delayMs={120} />
        </div>
      </div>
    </>
  );
}
