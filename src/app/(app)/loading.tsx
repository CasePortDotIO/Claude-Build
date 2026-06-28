// Shown automatically by Next while any (app) page's server component fetches.
// The sidebar (in the layout) stays put; this fills the main area with a calm
// skeleton so navigation feels instant instead of blank.
export default function AppLoading() {
  return (
    <>
      <div className="sticky top-0 z-30 flex h-[66px] items-center justify-between border-b border-[#e7e1d6] bg-[rgba(250,247,242,0.86)] px-4 pl-16 backdrop-blur-md lg:px-[34px]">
        <div className="h-5 w-44 animate-pulse rounded-md bg-[#ece6da]" />
        <div className="h-9 w-28 animate-pulse rounded-lg bg-[#ece6da]" />
      </div>
      <div className="flex-1 px-4 pb-[60px] pt-[30px] lg:px-[34px]">
        {/* KPI row */}
        <div className="mb-[22px] grid grid-cols-1 gap-[18px] md:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-[116px] animate-pulse rounded-xl2 bg-[#ece6da]" style={{ animationDelay: `${i * 80}ms` }} />
          ))}
        </div>
        {/* split content */}
        <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-[1.45fr_1fr]">
          <div className="h-[300px] animate-pulse rounded-xl2 bg-[#ece6da]" />
          <div className="h-[300px] animate-pulse rounded-xl2 bg-[#ece6da]" style={{ animationDelay: "120ms" }} />
        </div>
      </div>
    </>
  );
}
