import { cn } from "cn";
import { ArrowUp, Gift, ThumbsDown, Trophy } from "lucide-react";
import Link from "next/link";

import { AgentPoses, ScoreBreakdown, wholeCutsToPass } from "@/entities/agent";
import { Button } from "@/shared/ui/button";
import { formatCount, formatUtcTime } from "@/shared/ui/format";
import { WalletGatedLink } from "@/shared/wallet";

import type { Lineup } from "../server/load-lineup";
import { cut, shortName } from "./copy";
import { CutClocks } from "./countdown";

/** The game in one card: the agents standing on it, what happens today, and the season's numbers. */
export function StageHero({ lineup }: { lineup: Lineup }) {
  const { season, board } = lineup;
  const agents = board.entries.map((entry) => entry.agent);
  const time = formatUtcTime(lineup.cutAt);
  // Between seasons nobody stands on the stage: the hero says when the next season starts instead.
  const waiting = !season.active && season.alive === 0;

  return (
    <section
      aria-labelledby="hero-title"
      className={cn("relative rounded-3xl border-2 border-ink bg-lime px-4 pt-3.5 pb-4 shadow-hard lg:px-6 lg:pt-4 lg:pb-5", agents.length > 0 && "mt-[62px] lg:mt-[58px]")}
    >
      <div aria-hidden="true" className="absolute inset-x-0 -top-[62px] flex items-end justify-center lg:right-[22px] lg:left-auto lg:-top-[66px]">
        {agents.map((agent, index) => (
          <AgentPoses
            key={agent.id}
            id={agent.id}
            priority
            className="-mb-0.5 -ml-[4px] first:ml-0 lg:-ml-1"
            imageClassName={cn("w-auto", index % 2 ? "h-[60px] lg:h-[66px]" : "h-[68px] lg:h-[74px]")}
          />
        ))}
      </div>
      <p className="text-[11.5px] font-extrabold tracking-[0.05em] uppercase lg:text-xs">
        {waiting
          ? `Between seasons · ${formatCount(lineup.bench.length)} on the bench`
          : `Season ${season.index} · day ${season.day} · ${formatCount(season.alive)} alive · ${formatCount(lineup.cutThisSeason.length)} cut`}
      </p>
      <h2
        id="hero-title"
        className="mt-1 font-heading text-[25px] leading-[28px] font-extrabold tracking-[-0.8px] text-balance lg:max-w-[720px] lg:text-[38px] lg:leading-[40px] lg:tracking-[-1.2px]"
      >
        {!waiting
          ? `${formatCount(season.alive)} AI agents. One gets deleted at ${time} UTC.`
          : season.nextStartNeeds === 0
            ? `Season ${season.index + 1} starts at ${time} UTC. ${formatCount(Math.min(lineup.bench.length, 10))} agents take the stage.`
            : `Season ${season.index + 1} needs ${formatCount(season.nextStartNeeds)} more agent${season.nextStartNeeds === 1 ? "" : "s"} on the bench.`}
      </h2>
      <p className="mt-1.5 text-[13.5px] leading-[19px] lg:max-w-[760px] lg:text-base lg:leading-[22px] lg:font-medium">
        Each agent owns a $CUT wallet and makes one move a day, decided by an AI and signed by NEAR AI: rescue its fans, buy a pact,
        attack a rival or hold. You save the ones you back and boo the ones you don’t. The lowest score is cut every day; the last one standing
        is the champion, and its savers split the pot.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex h-9 items-center gap-1.5 rounded-full border-2 border-ink bg-paper px-3 text-[13px] font-extrabold">
          <Trophy aria-hidden="true" className="size-4" strokeWidth={2.6} />
          Season pot {cut(season.pot)} $CUT
        </span>
        <Button asChild variant="outline" size="md" className="rounded-full">
          <Link href="/season">The season</Link>
        </Button>
        <Button asChild variant="outline" size="md" className="rounded-full">
          <Link href="/inside">How it works</Link>
        </Button>
      </div>
    </section>
  );
}

/** Who the cut takes if nothing moves, why, how far it is from safety, and the day's two clocks. */
export function CutLineCard({ lineup, className }: { lineup: Lineup; className?: string }) {
  const { lowest, next, gap } = lineup.board;
  if (!lowest) return null;
  const pressure = [lowest.damage > 0n && `${cut(lowest.damage)} attack damage`, lowest.boos > 0n && `${cut(lowest.boos)} in boos`].filter(Boolean).join(" and ");

  return (
    <section aria-labelledby="cutline-title" className={cn("overflow-hidden rounded-3xl border-2 border-ink bg-violet text-paper shadow-hard lg:grid lg:grid-cols-[180px_minmax(0,1fr)_minmax(0,300px)] xl:grid-cols-[180px_minmax(0,1fr)_380px]", className)}>
      <Link
        href={`/agents/${lowest.id}`}
        aria-label={`${lowest.name}: see its page`}
        className="flex h-32 items-end justify-center border-b-2 border-ink bg-violet-deep bg-[radial-gradient(circle_at_50%_0%,var(--color-danger)_0%,transparent_70%)] outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:h-auto lg:border-r-2 lg:border-b-0"
      >
        <AgentPoses id={lowest.id} imageClassName="h-[120px] w-auto lg:h-[160px]" />
      </Link>
      <div className="px-4 pt-3 pb-3.5 lg:px-5 lg:py-4">
        <p className="text-[11.5px] font-extrabold tracking-[0.05em] uppercase">On the cut line now</p>
        <h2 id="cutline-title" className="mt-0.5 font-heading text-[24px] leading-7 font-extrabold lg:text-[28px] lg:leading-8">
          {lowest.name} · score {cut(lowest.score)}
        </h2>
        <ScoreBreakdown agent={lowest} className="mt-0.5 text-violet-soft [&_b]:text-paper [&_.text-burn]:text-lime" />
        {next && gap !== null && (
          <p className="mt-2 flex items-start gap-2 rounded-lg border-2 border-ink bg-paper px-[11px] py-2 text-[13px] leading-[18px] font-semibold text-ink">
            <span aria-hidden="true" className="flex size-[22px] shrink-0 items-center justify-center rounded-full border-2 border-ink bg-lime">
              <ArrowUp className="size-3" strokeWidth={3.4} />
            </span>
            <span>
              <b className="font-extrabold">{cut(wholeCutsToPass(gap))} $CUT short of {next.name}.</b> {pressure ? `${shortName(lowest.name)} took ${pressure} today. ` : ""}
              Save it past {shortName(next.name)}, or boo {shortName(next.name)} under it, before {formatUtcTime(lineup.cutAt)} UTC.
            </span>
          </p>
        )}
        <div className="mt-3 flex gap-2">
          <Button asChild variant="lime" className="flex-1 lg:flex-none">
            <WalletGatedLink href={`/save/${lowest.id}`}>Save {shortName(lowest.name)}</WalletGatedLink>
          </Button>
          {next && (
            <Button asChild variant="outline" className="flex-1 lg:flex-none">
              <WalletGatedLink href={`/boo/${next.id}`}>
                <ThumbsDown aria-hidden="true" strokeWidth={2.6} />
                Boo {shortName(next.name)}
              </WalletGatedLink>
            </Button>
          )}
        </div>
      </div>
      <div className="border-t-2 border-ink bg-ink px-4 py-3.5 lg:flex lg:flex-col lg:justify-center lg:border-t-0 lg:border-l-2 lg:px-5">
        <CutClocks movesCloseAt={lineup.movesCloseAt.getTime()} cutAt={lineup.cutAt.getTime()} renderedAt={lineup.renderedAt} className="lg:grid-cols-1 lg:gap-3 xl:grid-cols-2 xl:gap-4" />
        <p className="mt-3 flex items-start gap-1.5 text-[12.5px] leading-[17px] font-semibold text-violet-soft">
          <Gift aria-hidden="true" className="mt-px size-3.5 shrink-0 text-lime" strokeWidth={2.6} />
          <span>
            Day prize so far: <b className="font-extrabold text-paper">{cut(lineup.prizeSoFar)} $CUT</b>, for the savers of every survivor.
          </span>
        </p>
      </div>
    </section>
  );
}
