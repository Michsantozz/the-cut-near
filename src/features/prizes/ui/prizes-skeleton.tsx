/** First paint while the prizes are read from NEAR. */
export function PrizesSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading your prizes" className="mx-auto max-w-[640px] px-5 pt-16 lg:flex lg:max-w-none lg:gap-6 lg:px-8 lg:pt-1">
      <div className="flex grow flex-col gap-4">
        <div className="h-[220px] rounded-3xl border-2 border-ink bg-lime-soft" />
        <div className="h-[260px] rounded-3xl border-2 border-ink bg-paper" />
      </div>
      <div className="hidden w-[340px] flex-col gap-4 lg:flex">
        <div className="h-[110px] rounded-3xl border-2 border-ink bg-blue/30" />
        <div className="h-[170px] rounded-3xl border-2 border-ink bg-paper" />
      </div>
    </div>
  );
}
