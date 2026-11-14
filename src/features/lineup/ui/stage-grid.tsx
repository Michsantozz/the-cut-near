import { cn } from "cn";
import { Coins, Flame, Gift, Plus, Scissors, ThumbsDown, X } from "lucide-react";

import { pileShown } from "@/entities/agent";
import { Button } from "@/shared/ui/button";
import { formatUtcTime } from "@/shared/ui/format";
import { WalletGatedLink } from "@/shared/wallet";

import type { Lineup } from "../server/load-lineup";
import { AgentCard } from "./agent-card";
import { cut, cutScore, shortName } from "./copy";

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
              <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 [&>li>article]:w-full">
                {onTheLine.map(card)}
                {onTheLine.length === 1 && <AtTheCut lineup={lineup} />}
              </ol>
            </>
          )}
        </>
      )}
    </section>
  );
}

/** Next to the agent on the cut line: what the cut does to it, its wallet and its pile, and who gets paid. */
function AtTheCut({ lineup }: { lineup: Lineup }) {
  const { board, names, cutAt, prizeSoFar } = lineup;
  const { lowest, next } = board;
  if (!lowest) return null;
  const first = shortName(lowest.name);
  const heirStands = lowest.heir !== null && board.entries.some((entry) => entry.agent.id === lowest.heir && !entry.isLowest);
  const heir = heirStands && lowest.heir ? (names[lowest.heir] ?? lowest.heir) : null;
  const rows = [
    { icon: X, tone: "", text: `${first}’s NEAR account is deleted forever.` },
    heir
      ? { icon: Gift, tone: "text-gain", text: `Its ${cut(lowest.wallet)} $CUT wallet goes to its heir, ${heir}.` }
      : { icon: Flame, tone: "text-burn", text: `Its ${cut(lowest.wallet)} $CUT wallet burns: ${lowest.heir ? "its heir is no longer on the stage" : "it named no heir"}.` },
    { icon: Flame, tone: "text-burn", text: `Half of its ${cutScore(pileShown(lowest.pile))} $CUT pile burns. Its own savers get nothing back.` },
    { icon: Coins, tone: "text-gain", text: `The other half joins the day prize, ${cut(prizeSoFar)} $CUT so far, split among the savers of every survivor.` },
  ];
  return (
    <li className="self-start xl:col-span-2">
      <section aria-labelledby="at-the-cut-title" className="w-full rounded-3xl border-2 border-dashed border-danger bg-paper px-4 pt-3 pb-3.5 lg:px-5">
        <h3 id="at-the-cut-title" className="flex items-center gap-2 font-heading text-[18px] font-extrabold lg:text-xl">
          <Scissors aria-hidden="true" className="size-5 shrink-0 text-danger" strokeWidth={2.6} />
          What happens at {formatUtcTime(cutAt)} UTC
        </h3>
        <ul className="mt-2 flex flex-col gap-2 text-[13.5px] leading-[19px] font-semibold">
          {rows.map(({ icon: Icon, tone, text }) => (
            <li key={text} className="flex items-start gap-2">
              <Icon aria-hidden="true" className={cn("mt-0.5 size-4 shrink-0", tone)} strokeWidth={2.4} />
              <span>{text}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2.5 text-[12.5px] leading-[17px] text-ink-3">
          Unless a save lifts {first} past {next ? shortName(next.name) : "the next agent"}, or boos push {next ? shortName(next.name) : "that agent"} under it, before the cut.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild variant="lime" size="md">
            <WalletGatedLink href={`/save/${lowest.id}`}>
              <Plus aria-hidden="true" strokeWidth={3} />
              Save {first}
            </WalletGatedLink>
          </Button>
          {next && (
            <Button asChild variant="outline" size="md">
              <WalletGatedLink href={`/boo/${next.id}`}>
                <ThumbsDown aria-hidden="true" strokeWidth={2.6} />
                Boo {shortName(next.name)}
              </WalletGatedLink>
            </Button>
          )}
        </div>
      </section>
    </li>
  );
}
