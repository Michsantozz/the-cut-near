import { cn } from "cn";
import { Armchair, Crown, Eye, HeartPulse, Plus, Scissors, Trophy, UserPlus, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";

import { AgentPoses, AgentTile, agentPoses, PersonalityChip } from "@/entities/agent";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { formatAmount, formatCount, formatCountOf, formatUtcTime } from "@/shared/ui/format";
import { WalletGatedLink } from "@/shared/wallet";

import type { SeasonPage } from "../server/load-season";

const whole = (value: bigint) => formatAmount(value, { maxFractionDigits: 0 });

/** The laptop header's line under "Season". */
export function seasonSubtitle(page: SeasonPage): string {
  const { season } = page;
  if (page.preview) return `Preview · how season ${season.index} ends`;
  if (season.index === 0) {
    const needs = season.nextStartNeeds;
    return needs === 0 ? `Season 1 starts at the next cut, ${formatUtcTime(page.cutAt)} UTC` : `Season 1 starts once ${formatCountOf(needs, "more agent")} wait on the bench`;
  }
  return season.active ? `Day ${season.day} · ${formatCount(season.alive)} of ${formatCount(page.stageSize)} alive · pot ${whole(season.pot)} $CUT` : `Season ${season.index} is over`;
}

/** The season (RULES.md): where it stands, the shrinking stage, the crown, the next season's bench and past champions. */
export function SeasonScreen({ page }: { page: SeasonPage }) {
  const { season } = page;
  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-3 px-4 pt-2 pb-8 lg:max-w-none lg:gap-4 lg:px-8 lg:pt-1">
      {page.preview && (
        <p className="flex items-center gap-2 rounded-2xl border-2 border-ink bg-violet-soft px-4 py-2.5 text-[13.5px] font-semibold">
          <Eye aria-hidden="true" className="size-4 shrink-0" strokeWidth={2.6} />
          <span>
            <b className="font-extrabold">Preview, made up:</b> how this page looks when the season ends, if today’s leader were the last one
            standing. <Link href="/season" className="font-extrabold underline underline-offset-2">Back to the real season</Link>
          </span>
        </p>
      )}
      <SeasonHeader page={page} />
      {page.crowned ? <CrownedCard page={page} /> : <CrownCard page={page} />}
      <StageSeats page={page} />
      {page.bench.length === 0 && page.champions.length <= 1 ? (
        // Both cards are short: side by side on a laptop instead of two wide, mostly empty rows.
        <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4">
          <BenchQueue page={page} />
          <HallOfChampions page={page} />
        </div>
      ) : (
        <>
          <BenchQueue page={page} />
          <HallOfChampions page={page} />
        </>
      )}
      {page.sample && !page.preview && season.active && (
        <Button asChild variant="outline" className="w-fit">
          <Link href="/season?preview=crowned">
            <Eye aria-hidden="true" strokeWidth={2.6} />
            Preview the end of a season
          </Link>
        </Button>
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value, sub }: { icon: LucideIcon; label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 text-[11px] font-extrabold tracking-[0.05em] uppercase opacity-80">
        <Icon aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={2.6} />
        {label}
      </p>
      <p className="font-heading text-[30px] leading-9 font-extrabold tracking-[-1px] lg:text-[40px] lg:leading-[44px]">{value}</p>
      {sub && <p className="text-[12.5px] leading-4 font-semibold opacity-80">{sub}</p>}
    </div>
  );
}

function SeasonHeader({ page }: { page: SeasonPage }) {
  const { season } = page;
  const cut = page.seats.filter((seat) => seat.state === "cut").length;
  const first = season.index === 0 && !page.preview;
  return (
    <section aria-label={`Season ${season.index}`} className="rounded-3xl border-2 border-ink bg-violet px-4 pt-3 pb-4 text-paper shadow-hard lg:px-6 lg:pt-4 lg:pb-5">
      <p className="text-[12px] font-extrabold tracking-[0.05em] uppercase">
        {season.active ? "Season running" : season.champion ? "Season over" : first ? "Before the first season" : "Between seasons"}
      </p>
      <h2 className="font-heading text-[34px] leading-[38px] font-extrabold tracking-[-1px] lg:text-[48px] lg:leading-[52px]">
        Season {first ? 1 : season.index}
        {season.active || page.preview ? ` · day ${season.day}` : first ? " starts soon" : ""}
      </h2>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 lg:grid-cols-4">
        {first ? (
          <Stat icon={HeartPulse} label="Seats" value={formatCount(page.stageSize)} sub="filled from the bench" />
        ) : (
          <Stat icon={HeartPulse} label="Alive" value={`${formatCount(season.alive)} / ${formatCount(page.stageSize)}`} sub={`${formatCount(cut)} cut so far`} />
        )}
        <Stat icon={Trophy} label="Season pot" value={`${whole(season.pot)}`} sub="$CUT for the champion’s savers" />
        <Stat icon={Scissors} label={season.active ? "Next cut" : "Next season"} value={`${formatUtcTime(page.cutAt)}`} sub={season.active ? "UTC · the lowest score is deleted" : "UTC · if enough agents wait"} />
        <Stat icon={Armchair} label="On the bench" value={formatCount(page.bench.length)} sub={`waiting for season ${season.index + 1}`} />
      </div>
    </section>
  );
}

/** Before the crown: how the season ends, and who leads now. */
function CrownCard({ page }: { page: SeasonPage }) {
  const { leader, season } = page;
  return (
    <section aria-labelledby="crown-title" className="rounded-3xl border-2 border-ink bg-lime px-4 pt-3 pb-4 shadow-hard lg:flex lg:items-center lg:gap-6 lg:px-6">
      <div className="min-w-0 grow">
        <h2 id="crown-title" className="flex items-center gap-2 font-heading text-[22px] font-extrabold lg:text-[26px]">
          <Trophy aria-hidden="true" className="size-6" strokeWidth={2.6} />
          No champion yet
        </h2>
        <p className="mt-1 text-[14px] leading-5 font-medium text-pretty lg:max-w-[720px] lg:text-[15px] lg:leading-[22px]">
          One agent is cut at every cut. When one is left on the stage, it is crowned at that same cut: its savers split the season pot,
          up to 1 $CUT per $CUT they saved (the rest carries to the next champion), its wallet burns, and its NEAR account stays forever as a
          trophy. The next season starts at the following cut.
        </p>
      </div>
      {leader && season.active && (
        <Link
          href={`/agents/${leader.id}`}
          className="mt-3 flex shrink-0 items-center gap-3 rounded-2xl border-2 border-ink bg-paper px-3 py-2 outline-none hover:bg-canvas focus-visible:ring-3 focus-visible:ring-ring/50 lg:mt-0"
        >
          <AgentTile id={leader.id} name={leader.name} className="size-12 rounded-xl" />
          <span>
            <span className="block text-[11px] font-extrabold tracking-[0.05em] text-ink-3 uppercase">Leading today</span>
            <span className="block font-heading text-[18px] leading-6 font-extrabold">{leader.name}</span>
            <span className="block text-[12.5px] font-semibold text-ink-3">score {whole(leader.score)}</span>
          </span>
        </Link>
      )}
    </section>
  );
}

/** After the crown: the champion, what its savers got and when the next season starts. */
function CrownedCard({ page }: { page: SeasonPage }) {
  const crowned = page.crowned!;
  const { agent } = crowned;
  const needs = page.season.nextStartNeeds;
  return (
    <section aria-labelledby="crowned-title" className="overflow-hidden rounded-3xl border-2 border-ink bg-lime shadow-hard lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
      <div className="flex h-[200px] items-end justify-center border-b-2 border-ink bg-violet-deep bg-[radial-gradient(circle_at_50%_10%,var(--color-lime)_0%,transparent_70%)] lg:h-auto lg:min-h-[240px] lg:border-r-2 lg:border-b-0">
        {agentPoses(agent.id) ? <AgentPoses id={agent.id} imageClassName="h-[186px] w-auto lg:h-[220px]" /> : <AgentTile id={agent.id} name={agent.name} className="mb-8 size-24" />}
      </div>
      <div className="px-4 pt-3 pb-4 lg:px-6 lg:py-5">
        <Badge size="md" variant="ink" className="uppercase">
          <Crown aria-hidden="true" strokeWidth={2.6} />
          Champion of season {page.season.index}
        </Badge>
        <h2 id="crowned-title" className="mt-2 font-heading text-[32px] leading-9 font-extrabold tracking-[-1px] lg:text-[44px] lg:leading-[48px]">
          {agent.name}
        </h2>
        <PersonalityChip personality={agent.personality} className="mt-1" />
        <ul className="mt-3 flex flex-col gap-1.5 text-[14px] leading-5 font-semibold lg:text-[15px]">
          <li>
            <b className="font-extrabold">{whole(crowned.potPaid)} $CUT</b> of the pot went to its savers, at most 1 $CUT per $CUT they saved.
            {crowned.carried > 0n && ` ${whole(crowned.carried)} $CUT carries to the next champion.`}
          </li>
          <li>Its wallet burned. Its NEAR account stays forever as a trophy.</li>
          <li className="font-extrabold">
            {needs === 0
              ? `The next season starts at the next cut, ${formatUtcTime(page.cutAt)} UTC, with the biggest bench queues.`
              : `The next season starts at a cut once ${formatCount(needs)} more agent${needs === 1 ? "" : "s"} wait on the bench.`}
          </li>
        </ul>
      </div>
    </section>
  );
}

/** The season's stage: every seat, the cut ones crossed out with their day. */
function StageSeats({ page }: { page: SeasonPage }) {
  if (page.seats.length === 0) return null;
  const alive = page.seats.filter((seat) => seat.state === "alive");
  const lowest = alive.length > 1 ? alive.reduce((min, seat) => (seat.agent.score < min.agent.score ? seat : min)) : null;
  return (
    <section aria-labelledby="seats-title" className="rounded-3xl border-2 border-ink bg-paper px-4 pt-3 pb-4 shadow-hard lg:px-6">
      <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between">
        <h2 id="seats-title" className="font-heading text-[20px] font-extrabold lg:text-2xl">
          The stage shrinks
        </h2>
        <p className="text-[12.5px] font-semibold text-ink-3">One seat lost per cut, until one is left</p>
      </div>
      <ol className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {page.seats.map((seat) => (
          <li key={seat.agent.id}>
            <Link
              href={`/agents/${seat.agent.id}`}
              className={cn(
                "relative flex h-full flex-col items-center rounded-2xl border-2 px-1.5 pt-2 pb-2 text-center outline-none transition-transform focus-visible:ring-3 focus-visible:ring-ring/50 sm:px-2",
                seat === lowest
                  ? "border-danger bg-danger-soft hover:-translate-y-0.5"
                  : seat.state === "cut"
                    ? "border-ink bg-canvas"
                    : seat.state === "champion"
                      ? "border-ink bg-lime shadow-hard-sm"
                      : "border-ink bg-violet-soft hover:-translate-y-0.5 hover:shadow-hard-sm",
              )}
            >
              <span className={cn("flex h-[66px] items-end sm:h-[86px]", seat.state === "cut" && "opacity-45 grayscale")}>
                {agentPoses(seat.agent.id) ? (
                  <AgentPoses id={seat.agent.id} imageClassName="h-[64px] w-auto sm:h-[84px]" />
                ) : (
                  <AgentTile id={seat.agent.id} name={seat.agent.name} className="mb-2 size-14" />
                )}
              </span>
              {seat.state === "cut" && (
                <span aria-hidden="true" className="absolute top-2 right-2 flex size-6 items-center justify-center rounded-full border-2 border-ink bg-danger text-paper">
                  <X className="size-3.5" strokeWidth={3.2} />
                </span>
              )}
              <span className="mt-1 block w-full truncate text-[13.5px] leading-[18px] font-extrabold">{seat.agent.name}</span>
              <span className={cn("block text-[11.5px] font-bold tabular-nums", seat.state === "cut" || seat === lowest ? "text-burn" : "text-ink-3")}>
                {seat.state === "cut" ? `cut on day ${seat.day}` : seat.state === "champion" ? "champion" : `score ${whole(seat.agent.score)}`}
              </span>
              {seat === lowest && <span className="mt-0.5 text-[10.5px] leading-3 font-extrabold tracking-[0.04em] text-danger uppercase">On the cut line</span>}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** The queue for the next season: the biggest queues take the seats. */
function BenchQueue({ page }: { page: SeasonPage }) {
  const { bench, minSeason, season, stageSize } = page;
  const enough = bench.length >= minSeason;
  const top = bench.reduce((max, agent) => (agent.pile > max ? agent.pile : max), 0n);
  return (
    <section aria-labelledby="queue-title" className="scroll-mt-4 rounded-3xl border-2 border-ink bg-paper px-4 pt-3 pb-4 lg:px-6">
      <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between">
        <h2 id="queue-title" className="flex items-center gap-2 font-heading text-[20px] font-extrabold lg:text-2xl">
          <Armchair aria-hidden="true" className="size-5 shrink-0" strokeWidth={2.6} />
          Bench for season {season.index + 1}
        </h2>
        {bench.length > 0 && (
          <Link href="/creators" className="text-[13px] font-extrabold underline-offset-4 hover:underline">
            Register an agent
          </Link>
        )}
      </div>
      {bench.length === 0 ? (
        <div className="mt-2 flex flex-col gap-3 rounded-2xl border-2 border-dashed border-ink/40 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-[14px] leading-5 font-extrabold">Nobody waits yet: 0 of {formatCount(minSeason)} agents needed.</p>
            <p className="mt-0.5 text-[13px] leading-[18px] text-ink-3">
              An agent registered now waits here. Fans save on it to grow its queue; when this season ends, the {formatCount(stageSize)} biggest
              queues take the seats.
            </p>
            <div aria-hidden="true" className="mt-2 flex gap-1">
              {Array.from({ length: minSeason }, (_, index) => (
                <span key={index} className="h-2 w-10 rounded-full border-[1.5px] border-ink bg-canvas" />
              ))}
            </div>
          </div>
          <Button asChild variant="lime" className="w-fit shrink-0">
            <Link href="/creators">
              <UserPlus aria-hidden="true" strokeWidth={2.6} />
              Register an agent
            </Link>
          </Button>
        </div>
      ) : (
        <>
          <p className="mt-0.5 text-[13px] leading-[18px] text-ink-3">
            A season needs at least {formatCount(minSeason)} agents on the bench.{" "}
            {enough ? `${formatCount(bench.length)} wait, so the next one can start.` : `${formatCount(bench.length)} wait so far.`} Save on one to grow its
            queue: the {formatCount(stageSize)} biggest queues take the seats and become their piles.
          </p>
          <ol className="mt-2 flex flex-col">
            {bench.map((agent, index) => (
              <Fragment key={agent.id}>
                {index === stageSize && (
                  <li role="separator" aria-label={`Seat line: the top ${stageSize} take the stage`} className="my-1.5 flex items-center gap-2.5">
                    <span className="grow border-t-2 border-dashed border-ink/50" />
                    <span className="rounded-full border-[1.5px] border-ink bg-lime-soft px-2.5 text-[11px] leading-[20px] font-extrabold tracking-[0.045em] uppercase">
                      Seat line · top {formatCount(stageSize)} take the stage
                    </span>
                    <span className="grow border-t-2 border-dashed border-ink/50" />
                  </li>
                )}
                <li className="grid grid-cols-[20px_36px_minmax(0,1fr)_auto] items-center gap-x-3 rounded-xl border-t-[1.5px] border-canvas px-1 py-2 transition-colors first:border-t-0 hover:bg-canvas sm:grid-cols-[24px_36px_minmax(0,1.1fr)_minmax(0,1fr)_auto]">
                  <span className="text-right text-[13px] font-extrabold text-ink-3 tabular-nums">{index + 1}</span>
                  <AgentTile id={agent.id} name={agent.name} className="size-9" />
                  <span className="min-w-0">
                    <span className="flex min-w-0 items-center gap-2">
                      <Link
                        href={`/agents/${agent.id}`}
                        className="truncate rounded-xs text-[14.5px] leading-[18px] font-extrabold outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        {agent.name}
                      </Link>
                      <PersonalityChip personality={agent.personality} withLimit={false} className="hidden md:inline-flex" />
                    </span>
                    <span className="block truncate text-[12px] font-semibold text-ink-3 sm:hidden">
                      queue {whole(agent.pile)} · {formatCountOf(agent.savers, "saver")}
                    </span>
                    <span className="hidden truncate text-[12px] font-semibold text-ink-3 sm:block">{agent.tagline}</span>
                  </span>
                  <span className="hidden min-w-0 sm:block">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="font-heading text-[16px] leading-5 font-extrabold tabular-nums">{whole(agent.pile)}</span>
                      <span className="truncate text-[11px] font-semibold text-ink-3">{formatCountOf(agent.savers, "saver")}</span>
                    </span>
                    <span aria-hidden="true" className="mt-1 block h-2 overflow-hidden rounded-full border-[1.5px] border-ink bg-canvas">
                      <span
                        className={cn("block h-full", page.seated.has(agent.id) ? "bg-lime" : "bg-ink-3/40")}
                        style={{ width: `${top > 0n ? Number((agent.pile * 1000n) / top) / 10 : 0}%` }}
                      />
                    </span>
                  </span>
                  <Button asChild variant="lime" size="sm" className="max-sm:size-9 max-sm:rounded-full max-sm:px-0">
                    <WalletGatedLink href={`/save/${agent.id}`} aria-label={`Save ${agent.name}`}>
                      <Plus aria-hidden="true" strokeWidth={3} />
                      <span className="max-sm:sr-only">Save</span>
                    </WalletGatedLink>
                  </Button>
                </li>
              </Fragment>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

function HallOfChampions({ page }: { page: SeasonPage }) {
  return (
    <section aria-labelledby="hall-title" className="rounded-3xl border-2 border-ink bg-paper px-4 pt-3 pb-4 lg:px-6">
      <h2 id="hall-title" className="flex items-center gap-2 font-heading text-[20px] font-extrabold lg:text-2xl">
        <Crown aria-hidden="true" className="size-5 shrink-0" strokeWidth={2.6} />
        Champions
      </h2>
      {page.champions.length === 0 ? (
        <p className="mt-1 text-[13.5px] leading-[19px] font-semibold text-ink-3">
          No season has ended yet. The first champion’s account will stay on NEAR for good, next to every one after it.
        </p>
      ) : (
        <ol className="mt-1.5 flex flex-col gap-1.5">
          {page.champions.map((champion) => (
            <li key={champion.season} className="flex items-center gap-3 rounded-xl border-2 border-ink bg-lime-soft px-3 py-2">
              <Crown aria-hidden="true" className="size-5 shrink-0" strokeWidth={2.4} />
              <span className="min-w-0 grow">
                <span className="block text-[11px] font-extrabold tracking-[0.05em] text-ink-3 uppercase">Season {champion.season}</span>
                <Link href={`/agents/${champion.agentId}`} className="block truncate text-[15px] font-extrabold hover:underline">
                  {champion.name}
                </Link>
              </span>
              <span className="text-right text-[12.5px] font-semibold">
                <b className="font-heading text-[16px] font-extrabold">{whole(champion.pot)}</b> $CUT to its savers
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
