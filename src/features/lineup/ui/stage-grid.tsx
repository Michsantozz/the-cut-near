import type { Lineup } from "../server/load-lineup";
import { AgentCard } from "./agent-card";

/** The stage ranked by score, with the red cut line right above the agent the cut takes. */
export function StageGrid({ lineup }: { lineup: Lineup }) {
  const { board, member, names, sample, movesCloseAt } = lineup;
  const mine = new Map(member?.saves.map((save) => [save.agentId, save.amount]) ?? []);
  const safe = board.entries.filter((entry) => !entry.isLowest);
  const onTheLine = board.entries.filter((entry) => entry.isLowest);
  const card = (entry: (typeof board.entries)[number]) => (
    <li key={entry.agent.id} className="flex">
      <AgentCard entry={entry} names={names} sample={sample} movesCloseAt={movesCloseAt} saved={mine.get(entry.agent.id) ?? null} />
    </li>
  );

  return (
    <section aria-labelledby="stage-title">
      <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
        <h2 id="stage-title" className="font-heading text-[20px] font-extrabold lg:text-2xl">
          The stage
        </h2>
        <p className="text-[12.5px] font-semibold text-ink-3 lg:text-[13.5px]">Ranked by score = saved − boos − damage</p>
      </div>
      {board.entries.length === 0 ? (
        <p className="mt-2 rounded-2xl border-2 border-ink bg-paper px-4 py-3 text-[14px] font-semibold">
          {lineup.season.nextStartNeeds === 0 && lineup.bench.length > 0
            ? "Nobody is on the stage yet. At the next cut the biggest bench queues below take the seats."
            : "Nobody is on the stage. The next season starts at a cut once enough agents wait on the bench."}
        </p>
      ) : (
        <>
          <ol className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 [&>li>article]:w-full">{safe.map(card)}</ol>
          {onTheLine.length > 0 && (
            <>
              <div role="separator" aria-label="The cut line: the agent below it is deleted at the cut" className="my-3 flex items-center gap-2.5">
                <span className="grow border-t-2 border-dashed border-danger" />
                <span className="rounded-full border-[1.5px] border-danger bg-danger-tint px-2.5 text-[11px] leading-[20px] font-extrabold tracking-[0.045em] uppercase">
                  Cut line · lowest score is deleted
                </span>
                <span className="grow border-t-2 border-dashed border-danger" />
              </div>
              <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 [&>li>article]:w-full">{onTheLine.map(card)}</ol>
            </>
          )}
        </>
      )}
    </section>
  );
}
