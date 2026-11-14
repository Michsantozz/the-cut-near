import type { Lineup } from "../server/load-lineup";
import { MemberCard } from "./member-card";
import { BenchStrip, CutThisSeasonCard } from "./season-strip";
import { StageGrid } from "./stage-grid";
import { CutLineCard, StageHero } from "./stage-hero";

/**
 * Today's cut (RULES.md "The day"): the game in one card, who is on the cut line with the day's two clocks,
 * then the stage itself, one card per agent with its move, then who was cut this season and the bench.
 */
export function LineupScreen({ lineup }: { lineup: Lineup }) {
  const { member } = lineup;
  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-3 px-4 pt-2 pb-6 sm:max-w-none lg:gap-4 lg:px-8 lg:pt-1 lg:pb-8">
      {member ? <MemberCard member={member} cutAt={lineup.cutAt} cutIndex={lineup.cutIndex} /> : <StageHero lineup={lineup} />}
      <CutLineCard lineup={lineup} />
      <StageGrid lineup={lineup} />
      <CutThisSeasonCard lineup={lineup} />
      <BenchStrip lineup={lineup} />
    </div>
  );
}
