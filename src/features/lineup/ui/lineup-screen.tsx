import type { Lineup } from "../server/load-lineup";
import { CountdownCard } from "./countdown";
import { CutBoard } from "./cut-board";
import { MemberCard } from "./member-card";
import { BenchCard, DirectorCard, OnTheBlockCard } from "./side-cards";
import { VisitorHero } from "./visitor-hero";

/**
 * "Today's cut" (SPEC-v19 §6): the countdown first, then what the member holds, then the cut board.
 * On a wide laptop, who is on the block, the bench and the Director sit in a column on the right.
 */
export function LineupScreen({ lineup }: { lineup: Lineup }) {
  const { member } = lineup;
  const cutAt = lineup.cutAt.getTime();

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-2 px-5 pt-2 pb-6 lg:max-w-none lg:gap-4 lg:px-8 lg:pt-1 lg:pb-7 desk:flex-row desk:items-start desk:gap-6">
      <div className="flex min-w-0 flex-col gap-2 lg:gap-4 desk:flex-1">
        {!member && <VisitorHero lineup={lineup} />}
        <div className="flex flex-col gap-2 lg:flex-row lg:gap-4">
          <CountdownCard cutAt={cutAt} renderedAt={lineup.renderedAt} day={lineup.day} className={member ? undefined : "lg:hidden"} />
          {member && <MemberCard member={member} cutAt={lineup.cutAt} />}
        </div>
        <div className="mt-0.5 lg:mt-0">
          <CutBoard lineup={lineup} />
        </div>
      </div>
      <aside aria-label="Today’s cut" className="mt-2 grid gap-4 lg:mt-0 lg:grid-cols-2 desk:w-[316px] desk:shrink-0 desk:grid-cols-1">
        <OnTheBlockCard lineup={lineup} className="lg:row-span-2 desk:row-span-1" />
        <BenchCard bench={lineup.bench} />
        <DirectorCard lineup={lineup} />
      </aside>
    </div>
  );
}
