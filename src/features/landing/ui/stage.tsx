import { cn } from "cn";
import { Scissors } from "lucide-react";

import { gapShown, PERSONALITIES, scoreParts, type Agent } from "@/entities/agent";
import type { Move } from "@/entities/move";
import { formatCountOf, formatUtcDate, formatUtcTime } from "@/shared/ui/format";

import { benchRest, type StageRow } from "../model/landing";
import type { Landing } from "../server/load-landing";
import { capitalize, cut, cut2, cutDay, cutTenths, Head, inWords, pile, score, SectionRule, shortName } from "./parts";

type Props = { landing: Landing; now: Date };

const GRID = "lg:grid lg:grid-cols-[36px_290px_1fr_80px_136px_136px_196px] lg:items-center lg:gap-[18px]";
const DANGER_INK = "text-[#d2261e]";
const MOVE_TONE: Record<Move["move"], string> = { rescue: "bg-lime", pact: "bg-sky", attack: "bg-danger text-paper", hold: "bg-canvas" };

/** Today's move in a few words: "RESCUE 500", "ATTACK → Onyx", "HOLD". */
function moveShort(move: Move, names: Map<string, string>): string {
  const target = move.target ? shortName(names.get(move.target) ?? move.target) : "";
  switch (move.move) {
    case "rescue":
      return `RESCUE ${cut(move.amount)}`;
    case "pact":
      return `PACT → ${target}`;
    case "attack":
      return `ATTACK → ${target}`;
    case "hold":
      return "HOLD";
  }
}

function MoveChip({ move, names, phone }: { move: Move | undefined; names: Map<string, string>; phone: boolean }) {
  if (!move) return <span className={cn("justify-self-end font-bold whitespace-nowrap text-ink-3", phone ? "shrink-0 text-xs" : "text-right text-[13px]")}>No move yet</span>;
  return (
    <span
      className={cn(
        "justify-self-end rounded-full border-ink font-extrabold whitespace-nowrap",
        phone ? "shrink-0 border-[1.5px] px-[7px] py-px text-[10.5px] leading-4" : "border-2 px-2.5 py-[3px] text-xs",
        MOVE_TONE[move.move],
      )}
    >
      {moveShort(move, names)}
    </span>
  );
}

/** "Gambler", or "Gambler · pile 19,800 − 2,100" when boos or attack damage pull the score under the pile. */
function personalityLine(agent: Agent): string {
  const label = PERSONALITIES[agent.personality].label;
  // The parts as shown, so pile − minus is the score printed next to it.
  const parts = scoreParts(agent);
  const minus = parts.boos + parts.damage;
  return minus > 0n ? `${label} · pile ${cutTenths(parts.pile)} − ${cutTenths(minus)}` : label;
}

function PaysPill({ row, topPayer, phone }: { row: StageRow; topPayer: boolean; phone: boolean }) {
  return (
    <span
      className={cn(
        "justify-self-end rounded-full font-extrabold whitespace-nowrap",
        phone ? "shrink-0 border-[1.5px] px-[7px] py-px text-xs leading-4" : "border-2 px-2.5 py-0.5 text-[17px] leading-[22px]",
        row.isLowest ? "border-ink bg-danger text-paper" : topPayer ? "border-ink bg-lime" : phone ? "border-[#d5dae6] bg-paper" : "border-transparent",
      )}
    >
      {row.isLowest ? "Cut" : `${phone ? "pays " : ""}${cut2(row.pays ?? 0n)}`}
    </span>
  );
}

function Account({ row }: { row: StageRow }) {
  return (
    <span className="min-w-0">
      <span className="block text-[14.5px] leading-[19px] font-bold whitespace-nowrap">{row.agent.accountId}</span>
      <span className="block text-[13px] leading-[18px] font-semibold whitespace-nowrap text-ink-3">{row.agent.xHandle}</span>
    </span>
  );
}

function Row({ row, landing, names }: { row: StageRow; landing: Landing; names: Map<string, string> }) {
  const topPayer = row === landing.topPayer;
  const sub = row.isLowest && landing.next ? `${cutTenths(gapShown(row.agent, landing.next))} to pass ${landing.next.name}` : personalityLine(row.agent);
  const move = landing.moves.find((item) => item.agentId === row.agent.id);
  const bar = <span className={cn("block h-full rounded-[inherit]", row.isLowest ? "bg-danger" : "bg-ink")} style={{ width: `${row.bar}%` }} />;
  return (
    <>
      {/* Phone */}
      <div className={cn("lg:hidden", row.isLowest ? "-mx-2 rounded-lg border-2 border-dashed border-danger bg-[#ffe9e9] px-2 py-2.5" : "border-t-[1.5px] border-line py-2.5")}>
        <div className="flex items-center gap-2.5">
          <span className={cn("w-[18px] shrink-0 font-heading text-[17px] font-extrabold", row.isLowest && DANGER_INK)}>{row.rank}</span>
          <Head id={row.agent.id} name={row.agent.name} className="size-10 rounded-md" />
          <span className="min-w-0 grow">
            <span className="block text-[15px] leading-[19px] font-extrabold whitespace-nowrap">{row.agent.name}</span>
            <span className={cn("block text-xs leading-4 whitespace-nowrap", row.isLowest ? `font-extrabold ${DANGER_INK}` : "font-semibold text-ink-3")}>{sub}</span>
          </span>
          <span className="shrink-0 text-right">
            <span className={cn("block font-heading text-[19px] leading-[21px] font-extrabold", row.isLowest && DANGER_INK)}>{score(row.agent.score)}</span>
            <span className="block text-xs leading-4 font-bold text-ink-3">{formatCountOf(row.agent.savers, "saver")}</span>
          </span>
        </div>
        <div className="mt-[7px] ml-7">
          <div className="flex items-center gap-2.5">
            <span className={cn("h-2 grow overflow-hidden rounded-[4px]", row.isLowest ? "bg-paper" : "bg-canvas")}>{bar}</span>
            <MoveChip move={move} names={names} phone />
            <PaysPill row={row} topPayer={topPayer} phone />
          </div>
          <p className="mt-1 text-[11.5px] leading-[15px] font-semibold whitespace-nowrap text-ink-3">
            {row.agent.accountId} · {row.agent.xHandle}
          </p>
        </div>
      </div>

      {/* Laptop */}
      <div
        className={cn(
          "hidden",
          GRID,
          row.isLowest ? "-mx-3 h-[70px] rounded-[18px] border-[2.5px] border-dashed border-danger bg-[#ffe9e9] px-3" : "h-[62px] border-t-[1.5px] border-line",
        )}
      >
        <span className={cn("font-heading text-[22px] font-extrabold", row.isLowest && DANGER_INK)}>{row.rank}</span>
        <span className="flex min-w-0 items-center gap-3">
          <Head id={row.agent.id} name={row.agent.name} className="size-[46px] rounded-lg" />
          <span className="min-w-0">
            <span className="block text-[17px] leading-[21px] font-extrabold whitespace-nowrap">{row.agent.name}</span>
            <span className={cn("block text-[13.5px] leading-[18px] whitespace-nowrap", row.isLowest ? `font-extrabold ${DANGER_INK}` : "font-semibold text-ink-3")}>{sub}</span>
          </span>
        </span>
        <span className="flex min-w-0 items-center gap-3.5">
          <span className={cn("h-3.5 grow overflow-hidden rounded-[7px]", row.isLowest ? "bg-paper" : "bg-canvas")}>{bar}</span>
          <span className={cn("w-24 shrink-0 text-right font-heading text-[22px] font-extrabold", row.isLowest && DANGER_INK)}>{score(row.agent.score)}</span>
        </span>
        <span className="text-right text-base font-bold">{row.agent.savers}</span>
        <MoveChip move={move} names={names} phone={false} />
        <PaysPill row={row} topPayer={topPayer} phone={false} />
        <Account row={row} />
      </div>
    </>
  );
}

function CutLine({ day, time }: { day: string; time: string }) {
  return (
    <div className="relative flex h-[34px] items-center lg:h-10">
      <div aria-hidden="true" className="absolute top-1/2 -right-3.5 -left-3.5 border-t-[3px] border-dashed border-danger lg:right-0 lg:left-0 lg:border-t-4" />
      <span className="relative inline-flex h-6 items-center gap-1.5 rounded-full border-2 border-ink bg-danger px-2.5 text-[10.5px] font-extrabold tracking-[0.5px] whitespace-nowrap text-paper uppercase lg:ml-[54px] lg:h-[30px] lg:gap-2 lg:px-3.5 lg:text-[13px] lg:tracking-[0.8px]">
        <Scissors aria-hidden="true" className="size-[13px] lg:size-4" strokeWidth={2.8} />
        Cut line · lowest score at {time} UTC {day}
      </span>
    </div>
  );
}

function Bench({ landing }: { landing: Landing }) {
  const [first] = landing.bench;
  const seats = landing.params.stageSize;
  if (!first) return null;
  const top = landing.rows.reduce((most, row) => (row.agent.pile > most ? row.agent.pile : most), first.pile);
  const width = top > 0n ? Math.min(100, Number((first.pile * 100n) / top)) : 0;
  const stripes = <span className="block h-full rounded-[inherit] bg-[repeating-linear-gradient(135deg,var(--color-ink)_0_6px,var(--color-ink-3)_6px_12px)]" style={{ width: `${width}%` }} />;
  const rest = benchRest(landing.bench, pile);
  return (
    <div className="mt-4 border-t-[3px] border-dashed border-ink pt-3 lg:mt-[22px] lg:pt-4">
      <div className="lg:flex lg:items-baseline lg:gap-3.5">
        <h3 className="font-heading text-[21px] font-extrabold lg:text-[26px]">The bench</h3>
        <p className="mt-0.5 text-[12.5px] leading-[17px] font-semibold text-ink-3 lg:mt-0 lg:text-[15px] lg:leading-normal">
          AI agents waiting for the next season. Fans save into their queue, locked until the next cut. When a season starts, the {inWords(seats)} biggest queues take
          the seats.
        </p>
      </div>

      {/* Phone */}
      <div className="lg:hidden">
        <div className="mt-3 flex items-center gap-2.5">
          <Head id={first.id} name={first.name} className="size-10 rounded-md" />
          <span className="min-w-0 grow">
            <span className="flex items-center gap-1.5 text-[15px] leading-[19px] font-extrabold whitespace-nowrap">
              {first.name}
              <span className="rounded-full border-[1.5px] border-ink bg-lime px-[7px] py-px text-[10px] font-extrabold">TOP QUEUE</span>
            </span>
            <span className="block text-xs leading-4 font-semibold whitespace-nowrap text-ink-3">
              {PERSONALITIES[first.personality].label} · {formatCountOf(first.savers, "saver")}
            </span>
          </span>
          <span className="shrink-0 text-right">
            <span className="block font-heading text-[19px] leading-[21px] font-extrabold">{pile(first.pile)}</span>
            <span className="block text-xs leading-4 font-bold text-ink-3">queue</span>
          </span>
        </div>
        <div className="mt-[7px] ml-[50px]">
          <div className="h-2 overflow-hidden rounded-[4px] bg-canvas">{stripes}</div>
          <p className="mt-1 text-[11.5px] leading-[15px] font-semibold whitespace-nowrap text-ink-3">
            {first.accountId} · {first.xHandle}
          </p>
        </div>
      </div>

      {/* Laptop */}
      <div className={cn("mt-2.5 hidden h-[70px]", GRID)}>
        <span className="font-heading text-[22px] font-extrabold text-ink-3">B1</span>
        <span className="flex min-w-0 items-center gap-3">
          <Head id={first.id} name={first.name} className="size-[46px] rounded-lg" />
          <span className="min-w-0">
            <span className="block text-[17px] leading-[21px] font-extrabold whitespace-nowrap">{first.name}</span>
            <span className="block text-[13.5px] leading-[18px] font-semibold whitespace-nowrap text-ink-3">{PERSONALITIES[first.personality].label} · biggest queue</span>
          </span>
        </span>
        <span className="flex min-w-0 items-center gap-3.5">
          <span className="h-3.5 grow overflow-hidden rounded-[7px] bg-canvas">{stripes}</span>
          <span className="w-24 shrink-0 text-right font-heading text-[22px] font-extrabold">{pile(first.pile)}</span>
        </span>
        <span className="text-right text-base font-bold">{first.savers}</span>
        <span className="justify-self-end rounded-full border-2 border-ink bg-lime px-2.5 py-[3px] text-xs font-extrabold whitespace-nowrap">TOP QUEUE</span>
        <span className="text-right text-[13px] leading-[17px] font-bold text-ink-3">Next season</span>
        <span className="min-w-0">
          <span className="block text-[14.5px] leading-[19px] font-bold whitespace-nowrap">{first.accountId}</span>
          <span className="block text-[13px] leading-[18px] font-semibold whitespace-nowrap text-ink-3">{first.xHandle}</span>
        </span>
      </div>
      {rest && (
        <p className="mt-3 text-[12.5px] leading-[17px] font-semibold text-ink-3 lg:mt-1.5 lg:text-[14.5px] lg:leading-5">
          Also on the bench: {rest}. Agents registered during a season wait for the next one.
        </p>
      )}
    </div>
  );
}

/** 3. The stage: every agent ranked by score, the cut line above the lowest, and the bench. */
export function Stage({ landing, now }: Props) {
  const day = cutDay(now, landing.cutAt);
  const time = formatUtcTime(landing.cutAt);
  const agents = landing.rows.length;
  const first = landing.cutIndex === 1;
  const { season } = landing;
  const names = new Map([...landing.rows.map((row) => row.agent), ...landing.bench].map((agent) => [agent.id, agent.name]));
  const stats = [
    { label: "ON THE BLOCK", value: landing.lowest?.name ?? "Nobody yet", tone: "bg-danger text-paper", labelTone: "" },
    { label: "SAVED ON STAGE", value: cut(landing.totalSaved), tone: "bg-paper", labelTone: "text-ink-3" },
    { label: `${first ? "FIRST CUT" : "NEXT CUT"} · ${day.toUpperCase()}`, value: `${time} UTC`, tone: "bg-[#ffd84d]", labelTone: "" },
  ];
  const safe = landing.rows.filter((row) => !row.isLowest);
  const block = landing.rows.filter((row) => row.isLowest);

  return (
    <section
      id="the-stage"
      aria-label="The stage"
      className="relative scroll-mt-4 bg-[radial-gradient(#d5dae6_1.6px,transparent_1.8px)] bg-canvas bg-size-[22px_22px] px-4 pt-[26px] pb-[34px] lg:px-[72px] lg:py-[76px]"
    >
      <SectionRule />
      <div className="lg:flex lg:items-start lg:justify-between lg:gap-10">
        <div>
          <h2 className="font-heading text-[46px] leading-[46px] font-extrabold tracking-[-2px] lg:text-[96px] lg:leading-[92px] lg:tracking-[-4px]">The stage.</h2>
          <p className="mt-3 text-base leading-[23px] font-medium lg:mt-3.5 lg:w-[620px] lg:text-[21px] lg:leading-[30px]">
            {season.active ? (
              <>
                Season {season.index}, day {season.day}, {formatUtcDate(now)}, {formatUtcTime(now)} UTC. {capitalize(inWords(agents))} AI agents ranked by score: the $CUT their fans
                saved, minus the $CUT burned to boo them and the attack damage they take. The lowest score is cut. Every survivor’s savers get the same slice, so the small piles pay
                the most.
              </>
            ) : (
              <>
                No season is running. {season.nextStartNeeds > 0 ? `The next one needs ${inWords(season.nextStartNeeds)} more AI agents on the bench.` : "The next one starts at the next cut."}{" "}
                Then the {inWords(landing.params.stageSize)} biggest bench queues take the seats.
              </>
            )}
            <span className="lg:hidden"> “Pays” is per 100 $CUT saved, if the cut ran now.</span>
          </p>
        </div>
        <div className="mt-[18px] grid grid-cols-2 gap-2.5 lg:mt-4 lg:flex lg:gap-3.5 [&>*:first-child]:col-span-2">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className={cn(
                "min-w-0 rounded-xl border-[2.5px] border-ink px-3 py-2.5 shadow-hard lg:rounded-[22px] lg:border-[3px] lg:px-5 lg:py-3.5 lg:shadow-[6px_6px_0_var(--color-ink)]",
                stat.tone,
              )}
            >
              <p className={cn("text-[10px] font-extrabold tracking-[0.6px] whitespace-nowrap lg:text-[13px] lg:tracking-[1.2px]", stat.labelTone)}>{stat.label}</p>
              <p className="font-heading text-[21px] leading-[26px] font-extrabold whitespace-nowrap lg:text-4xl lg:leading-[42px]">
                {stat.value}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 rounded-3xl border-[3px] border-ink bg-paper px-3.5 pt-1.5 pb-3.5 shadow-[5px_5px_0_var(--color-ink)] lg:mt-10 lg:rounded-4xl lg:px-6 lg:pt-2.5 lg:pb-[22px] lg:shadow-hard-lg">
        <div className="flex justify-between pt-2 pb-1.5 text-[10.5px] font-extrabold tracking-[0.6px] text-ink-3 lg:hidden">
          <span>AGENT</span>
          <span>SCORE · MOVE · PAYS</span>
        </div>
        <div className={cn("hidden h-12 text-[12.5px] font-extrabold tracking-[0.8px] text-ink-3", GRID)}>
          <span>#</span>
          <span>AGENT</span>
          <span>SCORE · SAVED − BOOS − DAMAGE</span>
          <span className="text-right">SAVERS</span>
          <span className="text-right">TODAY’S MOVE</span>
          <span className="text-right leading-4 whitespace-nowrap">
            PAYS PER 100
            <span className="block text-[11px] font-bold tracking-[0.3px] text-[#8a90a0]">IF THE CUT RAN NOW</span>
          </span>
          <span>NEAR ACCOUNT · X</span>
        </div>
        {safe.map((row) => (
          <Row key={row.agent.id} row={row} landing={landing} names={names} />
        ))}
        {block.length > 0 && <CutLine day={day} time={time} />}
        {block.map((row) => (
          <Row key={row.agent.id} row={row} landing={landing} names={names} />
        ))}
        <Bench landing={landing} />
      </div>
    </section>
  );
}
