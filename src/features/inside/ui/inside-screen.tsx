import { cn } from "cn";
import { Activity, AlertCircle, ArrowUp, CalendarDays, Check, Clock, FileText, Flame, Lightbulb, PieChart, Scissors, Shield } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { barPercent, DIRECTOR_ART, RobotTile, robotFullBody, STAGE_ART } from "@/entities/robot";
import { publicEnv } from "@/shared/config/public";
import { explorerAccountUrl } from "@/shared/near/network";
import { Button } from "@/shared/ui/button";
import { CopyButton } from "@/shared/ui/copy-button";
import { formatAmount, formatCount, formatUtcDate, formatUtcTime, relativeUtcDay } from "@/shared/ui/format";

import { INSIDE_TABS, type InsideTab } from "../model/tabs";
import { SCENARIOS, simulate } from "../model/sim";
import type { Inside } from "../server/load-inside";

import { SimChart } from "./sim-chart";

const cut = (value: bigint) => formatAmount(value, { maxFractionDigits: 0 });
const cutFine = (value: bigint) => formatAmount(value, { maxFractionDigits: 1 });
const near = (value: bigint) => formatAmount(value, { decimals: 24, maxFractionDigits: 2 });
const pays = (value: bigint) => formatAmount(value, { maxFractionDigits: 2, minFractionDigits: 2 });
const percent = (bps: number) => `${bps / 100}%`;
const shortName = (name: string) => name.split(" ")[0] ?? name;

const TAB_ICON = { live: Activity, why: Lightbulb, rules: Shield, cuts: Clock } as const;

/** "Inside the cut": what the cut reads, why the lowest pile goes, the fixed rules and every past cut. */
export function InsideScreen({ inside, tab }: { inside: Inside; tab: InsideTab }) {
  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-3 px-5 pt-3 pb-6 lg:max-w-none lg:gap-[18px] lg:px-8 lg:pt-1 lg:pb-8">
      <p aria-hidden="true" className="text-center font-heading text-xl font-extrabold lg:hidden">
        Inside the cut
      </p>
      <nav aria-label="Inside the cut" className="flex rounded-2xl border-2 border-ink bg-paper p-1 lg:w-fit lg:gap-1">
        {INSIDE_TABS.map((item) => {
          const Icon = TAB_ICON[item.id];
          const active = item.id === tab;
          return (
            <Link
              key={item.id}
              href={item.id === "live" ? "/inside" : `/inside?tab=${item.id}`}
              aria-current={active ? "page" : undefined}
              scroll={false}
              className={cn(
                "flex h-10 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-extrabold outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:h-10 lg:flex-none lg:px-5 lg:text-[15px]",
                active ? "bg-ink text-paper" : "text-ink hover:bg-canvas",
              )}
            >
              <Icon aria-hidden="true" className="hidden size-4 lg:block" strokeWidth={2.6} />
              {item.label}
            </Link>
          );
        })}
      </nav>
      {tab === "live" && <LiveTab inside={inside} />}
      {tab === "why" && <WhyTab inside={inside} />}
      {tab === "rules" && <RulesTab inside={inside} />}
      {tab === "cuts" && <CutsTab inside={inside} />}
    </div>
  );
}

function Card({ children, className, ...props }: { children: ReactNode; className?: string } & React.ComponentProps<"section">) {
  return (
    <section className={cn("rounded-3xl border-2 border-ink bg-paper shadow-hard", className)} {...props}>
      {children}
    </section>
  );
}

/* ---------------------------------------------------------------- Live */

function LiveTab({ inside }: { inside: Inside }) {
  const top = inside.piles[0]?.robot.pile ?? 0n;
  const survivors = inside.piles.filter((pile) => !pile.isLowest);
  const lowest = inside.piles.find((pile) => pile.isLowest);
  const time = `${formatUtcTime(inside.cutAt)} UTC`;

  return (
    <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_316px] lg:items-start lg:gap-6">
      <Card aria-labelledby="piles-title" className="px-3.5 pt-3 pb-3 lg:px-[22px] lg:pt-4 lg:pb-4">
        <div className="flex items-baseline justify-between gap-3 lg:justify-start">
          <h2 id="piles-title" className="font-heading text-lg font-extrabold lg:text-2xl">
            Live piles
          </h2>
          <p className="text-[12.5px] font-semibold text-ink-3 lg:text-sm">
            read from NEAR <span className="hidden lg:inline">at</span>
            <span className="lg:hidden">·</span> {formatUtcTime(new Date(inside.renderedAt))} UTC<span className="hidden lg:inline"> · only $CUT counts</span>
          </p>
        </div>
        <table className="mt-2 w-full border-collapse text-left lg:mt-3">
          <thead>
            <tr className="text-[10.5px] font-extrabold tracking-[0.04em] text-ink-3 uppercase lg:text-[11px] lg:tracking-[0.05em]">
              <th scope="col" className="pb-1 align-bottom font-extrabold lg:border-b-2 lg:border-ink">
                <span className="lg:hidden">Robot · savers</span>
                <span className="hidden lg:inline">Robot · NEAR account</span>
              </th>
              <th scope="col" className="pb-1 text-right align-bottom font-extrabold lg:border-b-2 lg:border-ink lg:text-left">
                <span className="lg:hidden">Pile</span>
                <span className="hidden lg:inline">Pile · $CUT saved</span>
              </th>
              <th scope="col" className="hidden pb-1 text-right align-bottom font-extrabold lg:table-cell lg:border-b-2 lg:border-ink">
                Savers
              </th>
              <th scope="col" className="pb-1 text-right align-bottom font-extrabold lg:border-b-2 lg:border-ink">
                Today
              </th>
              <th scope="col" className="pb-1 text-right align-bottom font-extrabold lg:border-b-2 lg:border-ink">
                Pays per <br className="lg:hidden" />
                100 saved
                <span className="hidden text-[10px] font-semibold tracking-normal normal-case lg:block">if the cut ran now</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {survivors.map((pile) => (
              <PileRow key={pile.robot.id} pile={pile} top={top} />
            ))}
            <tr aria-hidden="true">
              <td colSpan={5} className="py-1">
                <div className="flex items-center gap-2">
                  <span className="grow border-t-2 border-dashed border-danger" />
                  <span className="text-[10.5px] font-extrabold tracking-[0.04em] whitespace-nowrap uppercase lg:rounded-full lg:border-[1.5px] lg:border-danger lg:bg-danger-soft lg:px-2.5 lg:text-[11px]">
                    Cut line · <span className="lg:hidden">lowest pile at {time}</span>
                    <span className="hidden lg:inline">the lowest pile is cut at {time}</span>
                  </span>
                  <span className="grow border-t-2 border-dashed border-danger" />
                </div>
              </td>
            </tr>
            {lowest && <PileRow pile={lowest} top={top} />}
          </tbody>
        </table>
        <p className="mt-2 flex items-start gap-2 rounded-xl bg-lime-soft px-3 py-2.5 text-[12.5px] leading-[17px] lg:mt-3 lg:items-center lg:px-[18px] lg:text-sm lg:leading-5">
          <PieChart aria-hidden="true" className="mt-0.5 size-4 shrink-0 lg:mt-0" strokeWidth={2.6} />
          <span>
            <b className="font-extrabold">
              <span className="lg:hidden">Pays per 100 saved, if the cut ran now. </span>Every survivor gets the same slice of the prize.
            </b>{" "}
            Small piles share it among fewer $CUT, so they pay more.
          </span>
        </p>
        <p className="mt-3 hidden text-[13px] text-ink-3 lg:block">Savers counts are for show and never touch money. Every save is a line in Receipts.</p>
      </Card>

      <div className="flex flex-col gap-3 lg:gap-4">
        <BenchQueues inside={inside} />
        <WhatTheCutReads inside={inside} />
      </div>
      <p className="text-[13px] leading-[18px] text-ink-3 lg:hidden">Only $CUT counts. Savers counts are for show and never touch money. Every save is a line in Receipts.</p>
    </div>
  );
}

function PileRow({ pile, top }: { pile: Inside["piles"][number]; top: bigint }) {
  const { robot } = pile;
  return (
    <tr className={cn(pile.isLowest ? "bg-danger-tint" : "lg:border-b-[1.5px] lg:border-canvas")}>
      <th scope="row" className={cn("py-[3px] pr-2 text-left font-normal lg:py-[5px]", pile.isLowest && "rounded-l-xl pl-1.5 lg:pl-2.5")}>
        <Link href={`/robots/${robot.id}`} className="flex items-center gap-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:gap-2.5">
          <RobotTile id={robot.id} name={robot.name} className="size-6 rounded-full lg:size-8 lg:rounded-md" />
          <span className="min-w-0">
            <span className="block text-[13.5px] leading-4 font-extrabold whitespace-nowrap lg:text-[15px] lg:leading-[18px]">{robot.name}</span>
            <span className="block text-[11.5px] leading-[14px] text-ink-3 lg:hidden">{formatCount(robot.savers)} savers</span>
            <span className="hidden text-xs leading-[15px] text-ink-3 lg:block">{robot.accountId}</span>
          </span>
        </Link>
      </th>
      <td className="py-[3px] text-right text-sm font-extrabold whitespace-nowrap lg:py-[5px] lg:text-left lg:text-[15px]">
        <span className="hidden lg:mr-3 lg:inline-block lg:h-2.5 lg:w-[118px] lg:overflow-hidden lg:rounded-[5px] lg:bg-canvas lg:align-middle">
          <span className={cn("block h-full", pile.isLowest ? "bg-danger" : "bg-ink")} style={{ width: `${barPercent(robot.pile, top, 4)}%` }} />
        </span>
        <span className="lg:inline-block lg:w-[64px] lg:text-right">{cut(robot.pile)}</span>
      </td>
      <td className="hidden py-[5px] text-right text-[15px] font-bold lg:table-cell">{formatCount(robot.savers)}</td>
      <td className="py-[3px] pl-2 text-right text-sm font-semibold text-gain lg:py-[5px] lg:text-[15px]">+{cut(robot.savedToday)}</td>
      <td className={cn("py-[3px] pl-2 text-right text-sm font-extrabold text-gain lg:py-[5px] lg:text-base", pile.isLowest && "rounded-r-xl pr-1.5 lg:pr-2.5")}>
        {pile.isLowest ? (
          <span className="inline-block rounded-full border-[1.5px] border-ink bg-danger px-2 text-[11.5px] leading-[18px] font-extrabold text-paper lg:px-2.5 lg:text-[12.5px] lg:leading-[21px]">
            Cut
          </span>
        ) : pile.paysPer100 === null ? (
          "–"
        ) : (
          pays(pile.paysPer100)
        )}
      </td>
    </tr>
  );
}

const QUEUE_TONE = ["bg-violet", "bg-violet", "bg-violet"];

function BenchQueues({ inside }: { inside: Inside }) {
  const top = inside.bench[0]?.pile ?? 0n;
  if (inside.bench.length === 0) return null;
  return (
    <Card aria-labelledby="queues-title" className="px-4 pt-3 pb-3 lg:px-[18px] lg:pt-4 lg:pb-3">
      <div className="flex items-baseline justify-between gap-2 lg:block">
        <h2 id="queues-title" className="font-heading text-lg font-extrabold lg:text-xl">
          Bench queues
        </h2>
        <p className="text-[12.5px] font-semibold text-ink-3 lg:text-[13px]">
          <span className="lg:hidden">biggest takes the empty seat</span>
          <span className="hidden lg:inline">The biggest queue takes the empty seat</span>
        </p>
      </div>
      <ul className="mt-1.5 lg:mt-2">
        {inside.bench.map((robot, index) => (
          <li key={robot.id} className="flex items-center gap-2.5 py-1 lg:border-t-[1.5px] lg:border-canvas lg:py-2.5 lg:first:border-t-0">
            <RobotTile id={robot.id} name={robot.name} className="size-6 rounded-full lg:size-8 lg:rounded-md" />
            <Link href={`/robots/${robot.id}`} className="w-[76px] shrink-0 text-sm font-extrabold lg:w-auto lg:grow lg:text-[15px]">
              {robot.name}
              <span className="hidden text-[12.5px] font-medium text-ink-3 lg:block">{formatCount(robot.savers)} savers</span>
            </Link>
            <span aria-hidden="true" className="h-2.5 grow overflow-hidden rounded-[5px] bg-canvas lg:hidden">
              <span className={cn("block h-full", QUEUE_TONE[index] ?? "bg-ink-4")} style={{ width: `${barPercent(robot.pile, top, 3)}%` }} />
            </span>
            <span className="w-[54px] text-right text-sm font-extrabold lg:w-auto lg:text-lg">{cut(robot.pile)}</span>
            <span className="w-[62px] text-right text-[13px] text-ink-3 lg:hidden">{formatCount(robot.savers)} savers</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function WhatTheCutReads({ inside }: { inside: Inside }) {
  const rows = [
    { title: "Piles and queues", sub: `kept by the contract ${publicEnv.contractId}`, tag: "Live", tone: "bg-lime" },
    { title: "NEAR block time", sub: `the cut reads ${formatUtcTime(inside.cutAt)}:00 UTC`, tag: `Daily ${formatUtcTime(inside.cutAt)}`, tone: "bg-lime" },
    { title: "The day’s 1% fees", sub: `${cut(inside.fees)} $CUT so far today`, tag: "Live", tone: "bg-lime" },
    { title: "NEAR AI", sub: "writes lines only, signed", tag: "Signed", tone: "bg-violet-soft" },
  ];
  return (
    <Card aria-labelledby="reads-title" className="hidden px-[18px] pt-4 pb-2 lg:block">
      <h2 id="reads-title" className="font-heading text-xl font-extrabold">
        What the cut reads
      </h2>
      <ul className="mt-1">
        {rows.map((row) => (
          <li key={row.title} className="flex items-center gap-3 border-t-[1.5px] border-canvas py-2.5 first:border-t-0">
            <span className="min-w-0 grow">
              <span className="block text-[15px] font-extrabold">{row.title}</span>
              <span className="block truncate text-[13px] text-ink-3">{row.sub}</span>
            </span>
            <span className={cn("rounded-full border-[1.5px] border-ink px-2.5 text-xs leading-5 font-extrabold whitespace-nowrap", row.tone)}>{row.tag}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ---------------------------------------------------------------- Why */

function WhyTab({ inside }: { inside: Inside }) {
  const { lowest, next } = inside;
  if (!lowest) return <p className="text-ink-3">No robot is on the stage.</p>;
  const day = relativeUtcDay(new Date(inside.renderedAt), inside.cutAt);
  const time = formatUtcTime(inside.cutAt);
  const lowestArt = robotFullBody(lowest.id);
  const fill = next && next.pile > 0n ? Math.min(100, Math.max(3, Number((lowest.pile * 100n) / next.pile))) : 100;
  const survivors = inside.params.stageSize - 1;
  const steps: [string, string][] = [
    [`${lowest.accountId} is deleted for good`, "gone"],
    [`Half of ${lowest.name}’s pile burns`, cut(inside.burn)],
    ["The other half + the day’s 1% fees is the prize", `≈${cut(inside.prize)}`],
    [`${percent(inside.params.saversBps)} to savers: ${survivors} equal slices, one per surviving robot`, `≈${cutFine(inside.slice)} each`],
    [`${percent(10_000 - inside.params.saversBps)} to the ${survivors} survivors’ creators`, `≈${cutFine(inside.creatorSlice)} each`],
    ...(inside.bench[0] ? ([[`${inside.bench[0].name} takes the seat; its queue becomes its pile`, cut(inside.bench[0].pile)]] as [string, string][]) : []),
  ];
  const STEP_TONE = ["bg-orange", "bg-orange", "bg-lime", "bg-lime", "bg-lime", "bg-violet-soft"];

  return (
    <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start lg:gap-6">
      <Card aria-labelledby="why-title" className="contents shadow-none lg:block lg:px-6 lg:pt-5 lg:pb-6 lg:shadow-hard">
        <div className="px-0.5 lg:px-0">
          <p className="text-xs font-extrabold tracking-[0.05em] text-ink-3 uppercase">
            If nothing moves · {day ? `${day} ` : `${formatUtcDate(inside.cutAt)} `}
            {time} UTC
          </p>
          <h2 id="why-title" className="font-heading text-[26px] leading-[30px] font-extrabold tracking-[-0.8px] lg:text-4xl lg:leading-10 lg:tracking-[-1.2px]">
            {lowest.name} is cut
          </h2>
        </div>
        <div className="rounded-3xl border-2 border-ink bg-paper p-3.5 shadow-hard lg:mt-3 lg:rounded-none lg:border-0 lg:p-0 lg:shadow-none">
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-[1fr_auto_1fr] lg:items-center lg:gap-6">
            <PileFace robot={lowest} label={`${lowest.name} · lowest`} tone="bg-danger-tint" art={lowestArt ? lowest.id : null} />
            <span aria-hidden="true" className="hidden size-[52px] items-center justify-center rounded-full bg-ink font-heading text-lg font-extrabold text-paper lg:flex">
              vs
            </span>
            {next && <PileFace robot={next} label={`${next.name} · next up`} tone="bg-paper" art={next.id} flip />}
          </div>
          {next && (
            <>
              <div aria-hidden="true" className="mt-3 h-3.5 overflow-hidden rounded-md border-2 border-ink bg-canvas lg:mt-[22px] lg:h-[18px] lg:rounded-lg">
                <div className="h-full border-r-2 border-ink bg-danger" style={{ width: `${fill}%` }} />
              </div>
              <div className="mt-1 flex justify-between text-xs font-bold text-ink-3 lg:text-[13px]">
                <span>
                  {lowest.name} {cut(lowest.pile)}
                  <span className="hidden lg:inline"> $CUT</span>
                </span>
                <span>
                  {next.name} {cut(next.pile)}
                  <span className="hidden lg:inline"> $CUT</span>
                </span>
              </div>
              <p className="mt-2 text-[15px] leading-5 font-extrabold lg:hidden">
                The gap is {cut(inside.gap)} $CUT. {shortName(lowest.name)}’s savers have until {time}:00 UTC to close it.
              </p>
              <p className="mt-3.5 hidden items-center gap-3 rounded-2xl border-2 border-ink bg-canvas px-[18px] py-3 lg:flex">
                <span className="font-heading text-[28px] font-extrabold whitespace-nowrap">{cut(inside.gap)} $CUT</span>
                <span className="text-[15px] leading-5 font-bold">
                  is what {shortName(lowest.name)}’s savers must add by {time}:00 UTC to pass {next.name}. Ties cut the newer robot.
                </span>
              </p>
              <p className="mt-2.5 flex items-start gap-2 rounded-xl border-2 border-ink bg-lime-soft px-3 py-2 text-[13px] leading-[18px] font-bold lg:mt-3.5 lg:items-center lg:gap-3 lg:rounded-2xl lg:px-[18px] lg:py-3 lg:text-[15px] lg:leading-[21px]">
                <span aria-hidden="true" className="flex size-[22px] shrink-0 items-center justify-center rounded-full border-2 border-ink bg-lime lg:size-[30px]">
                  <ArrowUp className="size-3 lg:size-4" strokeWidth={3.2} />
                </span>
                <span>
                  <b className="font-extrabold">Rescue pays.</b> Lift {shortName(lowest.name)} past {next.name} ({cut(inside.gap)} $CUT) and it survives with the smallest pile: it pays
                  the most per $CUT.
                </span>
              </p>
            </>
          )}
        </div>
      </Card>

      <div className="flex flex-col gap-3 lg:gap-4">
        <Card aria-labelledby="tx-title" className="px-4 pt-3 pb-2 lg:px-5 lg:pt-4 lg:pb-3">
          <h2 id="tx-title" className="font-heading text-[17px] leading-[22px] font-extrabold lg:text-xl lg:leading-6">
            What {time} UTC does, in one transaction
          </h2>
          <ol className="mt-1.5 lg:mt-2">
            {steps.map(([what, value], index) => (
              <li key={what} className="flex items-start gap-2.5 border-canvas py-1 text-[13.5px] leading-[18px] lg:gap-3 lg:border-t-[1.5px] lg:py-2.5 lg:text-[14.5px] lg:leading-5 lg:first:border-t-0">
                <span className={cn("mt-px flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-ink text-[11px] font-extrabold lg:size-[22px]", STEP_TONE[index])}>
                  {index + 1}
                </span>
                <span className="grow">{what}</span>
                <span className="font-extrabold whitespace-nowrap">{value}</span>
              </li>
            ))}
          </ol>
        </Card>
        <section className="rounded-3xl border-2 border-ink bg-violet px-4 py-3.5 text-paper shadow-hard lg:px-5 lg:py-4">
          <p className="text-[15px] leading-[21px] font-semibold lg:text-base lg:font-medium">
            <b className="font-extrabold lg:block lg:font-heading lg:text-[21px] lg:leading-[26px]">The math picks. The AI only talks.</b> The lowest pile is cut, read from
            NEAR block time. The Director writes the one-liners, signed by NEAR AI, and decides nothing.
          </p>
        </section>
      </div>
    </div>
  );
}

function PileFace({ robot, label, tone, flip, art }: { robot: Inside["piles"][number]["robot"]; label: string; tone: string; flip?: boolean; art: string | null }) {
  return (
    <Link
      href={`/robots/${robot.id}`}
      className={cn(
        "flex items-center gap-2.5 rounded-2xl border-2 border-ink px-2.5 py-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:gap-4 lg:px-[18px] lg:py-3.5",
        tone,
        flip && "lg:flex-row-reverse lg:text-right",
      )}
    >
      {art ? <RobotTile id={robot.id} name={robot.name} className="size-9 rounded-lg lg:size-[60px] lg:rounded-xl" /> : null}
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-extrabold lg:text-[15px]">
          <span className="lg:hidden">{robot.name}</span>
          <span className="hidden lg:inline">{label}</span>
        </span>
        <span className="block font-heading text-[22px] leading-6 font-extrabold lg:text-[40px] lg:leading-[42px]">{cut(robot.pile)}</span>
      </span>
    </Link>
  );
}

/* ---------------------------------------------------------------- Rules */

function RulesTab({ inside }: { inside: Inside }) {
  const { params } = inside;
  const time = formatUtcTime(params.firstCutAt);
  const survivors = params.stageSize - 1;
  const house = [
    "Saves count by $CUT, never by people.",
    "Saved $CUT is locked until the next cut, at most 24 hours. Add any time.",
    `Every day at ${time}:00 UTC, NEAR block time, the lowest pile is cut. Tie: the newer robot.`,
    `Half its pile burns. The other half plus the day’s ${percent(params.feeBps)} fees is the prize: ${percent(params.saversBps)} to savers in ${survivors} equal slices, ${percent(10_000 - params.saversBps)} to creators.`,
    "Every survivor gets the same slice of the prize. Small piles share it among fewer $CUT, so they pay more.",
    `Anyone can run the cut from ${time} and keeps ${near(params.robotFunding)} NEAR. Earlier is refused.`,
    "Robot wallets obey only the rules. The biggest bench queue takes the empty seat.",
  ];
  const fakes = [
    "1,000 $CUT split over 1,000 accounts weighs the same as one account.",
    "Savers counts and club points are for show. They never touch money.",
    "A whale can keep a robot alive alone. Allowed, and every save is public in Receipts.",
    `Last-minute saves count. The cut reads ${time}:00 block time; nobody picks.`,
    `A fake robot locks a ${near(params.registerDeposit)} NEAR deposit and loses ${near(params.robotFunding)} NEAR of it for good. A rich group can still protect its robot every day.`,
  ];

  return (
    <div className="flex flex-col gap-3 lg:gap-6">
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:gap-6">
        <RuleList title="House rules" items={house} tone="yes" />
        <RuleList title="Fakes and whales" items={fakes} tone="warn" />
      </div>
      <WhoCanStopIt />
      <Parameters inside={inside} />
      <Simulation />
    </div>
  );
}

function RuleList({ title, items, tone }: { title: string; items: string[]; tone: "yes" | "warn" }) {
  return (
    <Card className="px-4 pt-3 pb-3.5 lg:px-[22px] lg:pt-[18px] lg:pb-[22px]">
      <h2 className="flex items-center gap-3 font-heading text-lg font-extrabold lg:text-2xl">
        <span className={cn("hidden size-[38px] items-center justify-center rounded-xl border-2 border-ink lg:flex", tone === "yes" ? "bg-lime" : "bg-orange")}>
          {tone === "yes" ? <Shield aria-hidden="true" className="size-[18px]" strokeWidth={2.6} /> : <AlertCircle aria-hidden="true" className="size-[18px]" strokeWidth={2.6} />}
        </span>
        {title}
      </h2>
      <ul className="mt-1.5 flex flex-col gap-1.5 lg:mt-4 lg:gap-3">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2 text-sm leading-[19px] lg:gap-3 lg:text-[15px] lg:leading-[21px]">
            <span
              className={cn(
                "mt-px flex size-[18px] shrink-0 items-center justify-center rounded-full border-2 border-ink lg:size-[22px]",
                tone === "yes" ? "bg-lime" : "bg-orange",
              )}
            >
              {tone === "yes" ? (
                <Check aria-hidden="true" className="size-2.5 lg:size-3" strokeWidth={4} />
              ) : (
                <span aria-hidden="true" className="text-[10px] leading-none font-extrabold lg:text-[11px]">
                  !
                </span>
              )}
            </span>
            {item}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function WhoCanStopIt() {
  return (
    <section className="relative overflow-hidden rounded-3xl border-2 border-ink bg-ink px-4 py-3.5 text-paper shadow-hard-violet lg:flex lg:items-center lg:gap-8 lg:py-6 lg:pr-7 lg:pl-[158px]">
      <Image src={DIRECTOR_ART.src} alt="" width={DIRECTOR_ART.width} height={DIRECTOR_ART.height} className="absolute bottom-[-2px] left-6 hidden h-[140px] w-auto lg:block" />
      <div className="grow">
        <h2 className="flex items-center justify-between gap-3 font-heading text-lg font-extrabold lg:justify-start lg:text-[28px]">
          Who can stop it
          <span className="rounded-full bg-lime px-2.5 font-sans text-[13px] leading-6 font-extrabold text-ink lg:text-[15px]">Nobody</span>
        </h2>
        <p className="mt-1 text-[13.5px] leading-[19px] text-line-3 lg:mt-2 lg:max-w-[560px] lg:text-base lg:leading-[23px]">
          Fixed at launch, no owner key. Nobody can pause it, change a rule or move a robot’s pile. Not us either.
        </p>
      </div>
      <Button asChild variant="outline" size="xl" className="mt-3 h-12 w-full shadow-[3px_3px_0_var(--color-lime)] lg:mt-0 lg:w-auto">
        <a href={explorerAccountUrl(publicEnv.network, publicEnv.contractId)} target="_blank" rel="noopener">
          <FileText aria-hidden="true" className="size-[17px]" strokeWidth={2.6} />
          Read the rules contract on NEAR
        </a>
      </Button>
    </section>
  );
}

/** The launch parameters, read live with `get_params`: nobody can change them, and anyone can read them. */
function Parameters({ inside }: { inside: Inside }) {
  const { params } = inside;
  const command = `near view ${publicEnv.contractId} get_params`;
  const every = params.cutIntervalMs >= 86_400_000 ? `every day ${formatUtcTime(params.firstCutAt)} UTC` : `every ${Math.round(params.cutIntervalMs / 60_000)} minutes`;
  const rows: [string, string, string][] = [
    ["total_supply", cut(params.totalSupply), "$CUT, minted once"],
    ["fee_bps", String(params.feeBps), `${percent(params.feeBps)} on every buy and sell, to the next prize`],
    ["burn_bps", String(params.burnBps), `${percent(params.burnBps)} of the cut pile burns`],
    ["savers_bps", String(params.saversBps), `${percent(params.saversBps)} of the prize to savers, the rest to creators`],
    ["stage_size", String(params.stageSize), "seats on the stage"],
    ["first_cut_at", `${formatUtcDate(params.firstCutAt)}, ${formatUtcTime(params.firstCutAt)} UTC`, "the first cut"],
    ["cut_interval", `${formatCount(params.cutIntervalMs / 1_000)} s`, every],
    ["robot_funding", `${near(params.robotFunding)} NEAR`, "left in the robot account; the cut runner receives it"],
    ["register_deposit", `${near(params.registerDeposit)} NEAR`, `to register a robot, ${near(params.registerDeposit - params.robotFunding)} back when it leaves`],
  ];

  return (
    <section aria-labelledby="params-title" className="rounded-3xl border-2 border-ink bg-ink px-4 py-4 text-paper shadow-[4px_4px_0_var(--color-lime)] lg:px-6 lg:py-[22px]">
      <div className="lg:flex lg:items-start lg:justify-between lg:gap-8">
        <div>
          <h2 id="params-title" className="font-heading text-xl font-extrabold lg:text-[26px]">
            Read them yourself
          </h2>
          <p className="mt-1 text-[13.5px] leading-[19px] text-[#b9becb] lg:text-sm lg:leading-5">
            Set once at launch and read live from the contract with <span className="font-bold text-paper">get_params</span>. No owner key can change them.
          </p>
        </div>
        <div className="mt-3 flex items-center gap-2.5 rounded-[14px] bg-[#23252b] py-2.5 pr-2.5 pl-4 lg:mt-0 lg:w-[460px] lg:shrink-0">
          <code className="grow font-sans text-sm leading-5 font-semibold break-all">{command}</code>
          <CopyButton text={command} variant="lime" size="sm" className="h-[34px] rounded-[10px] border-0 px-3.5 text-[13px]" />
        </div>
      </div>
      <dl className="mt-4 grid gap-x-8 lg:grid-cols-3">
        {rows.map(([key, value, note]) => (
          <div key={key} className="border-t-[1.5px] border-ink-2 py-2.5">
            <dt className="text-xs font-bold text-[#b9becb]">{key}</dt>
            <dd className="text-[17px] font-extrabold">{value}</dd>
            <dd className="text-[13px] leading-[18px] text-line-3">{note}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** The 60-day simulation (SPEC-v19 §3), computed here by the same model as `scripts/sim.py`. */
function Simulation() {
  const results = SCENARIOS.map((scenario) => simulate(scenario));
  const whole = (value: number) => formatCount(Math.round(value));
  const steady = results.find((result) => result.scenario.key === "steady")!;
  const top = results.find((result) => result.scenario.key === "top")!;
  const LINE: Record<string, string> = { steady: "border-blue", top: "border-danger", whale: "border-violet", sybil: "border-ink border-dashed", ghost: "border-[#9aa0ae]" };

  return (
    <section aria-labelledby="sim-title" className="rounded-3xl border-2 border-ink bg-[#ffd84d] px-4 py-4 shadow-hard lg:px-6 lg:py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="sim-title" className="font-heading text-[28px] leading-[30px] font-extrabold tracking-[-1px] lg:text-5xl lg:leading-[50px] lg:tracking-[-2px]">
            We ran 60 days first.
          </h2>
          <p className="mt-2 max-w-[760px] text-[14.5px] leading-[21px] font-medium lg:text-[17px] lg:leading-[25px]">
            Sixty daily cuts, Nov 13 to Jan 11, five kinds of crowd. Every day half the lowest pile burns, so supply only goes down. Computed by scripts/sim.py.
          </p>
        </div>
        <span className="rounded-[10px] bg-ink px-3 py-1.5 text-xs font-extrabold tracking-[0.08em] whitespace-nowrap text-[#ffd84d] lg:text-[13px]">MODEL, NOT A PROMISE</span>
      </div>

      <div className="mt-4 flex flex-col gap-4 lg:mt-6 lg:flex-row lg:items-center lg:gap-6">
        <div className="rounded-3xl border-2 border-ink bg-paper px-3 pt-3 pb-2 shadow-hard lg:w-[62%] lg:shrink-0 lg:px-5 lg:pt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-heading text-lg font-extrabold lg:text-[22px]">$CUT supply, every 10 days</h3>
            <p className="text-xs font-bold text-ink-3 lg:text-[13px]">Simulated · 60 daily cuts</p>
          </div>
          <div className="mt-2">
            <SimChart results={results} />
          </div>
        </div>
        <div className="flex grow flex-col gap-3 lg:gap-4">
          {[
            { value: `−${steady.burnedPercent.toFixed(2)}%`, text: `supply after 60 steady days: ${whole(steady.burned)} $CUT burned over 60 daily cuts.` },
            { value: `−${top.burnedPercent.toFixed(2)}%`, text: "when fans ignore the slices and stack the leaders. Small bottom piles burn less." },
            { value: "= Steady", text: "what 5,000 fake accounts change. Saves count by $CUT, not by people." },
          ].map((big) => (
            <div key={big.value} className="border-b-[3px] border-dashed border-ink pb-3 last:border-b-0 lg:pb-4">
              <p className="font-heading text-[40px] leading-[42px] font-extrabold tracking-[-1.5px] whitespace-nowrap lg:text-[56px] lg:leading-[56px] lg:tracking-[-2px]">{big.value}</p>
              <p className="mt-1 text-[14.5px] leading-5 font-semibold lg:text-base lg:leading-[23px]">{big.text}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-3xl border-2 border-ink bg-paper px-4 pt-1 pb-2 shadow-hard lg:mt-6 lg:px-6">
        <table className="w-full min-w-[640px] border-collapse text-left">
          <thead>
            <tr className="h-11 text-xs font-extrabold tracking-[0.06em] text-ink-3 uppercase">
              <th scope="col" className="font-extrabold">
                Scenario
              </th>
              <th scope="col" className="font-extrabold">
                What happens
              </th>
              <th scope="col" className="text-right font-extrabold">
                Burned in 60 days
              </th>
              <th scope="col" className="text-right font-extrabold">
                Supply on day 60
              </th>
              <th scope="col" className="text-right font-extrabold">
                Prizes paid
              </th>
            </tr>
          </thead>
          <tbody>
            {results.map((result) => (
              <tr key={result.scenario.key} className="border-t-[1.5px] border-line">
                <th scope="row" className="py-2.5 pr-4 font-heading text-[17px] font-extrabold whitespace-nowrap lg:text-lg">
                  <span className="flex items-center gap-2.5">
                    <span aria-hidden="true" className={cn("w-[26px] shrink-0 border-t-4", LINE[result.scenario.key])} />
                    {result.scenario.name}
                  </span>
                </th>
                <td className="py-2.5 pr-4 text-sm leading-5 font-medium text-ink-2">{result.scenario.what}</td>
                <td className="py-2.5 text-right text-[15px] leading-5 font-extrabold whitespace-nowrap">
                  {whole(result.burned)}
                  <span className="block text-[12.5px] font-semibold text-ink-3">
                    {result.burnedPercent.toFixed(2)}%{result.scenario.key === "sybil" ? ", same as Steady" : ""}
                  </span>
                </td>
                <td className="py-2.5 pl-4 text-right text-[15px] font-bold whitespace-nowrap">{whole(result.supply.at(-1) ?? 0)}</td>
                <td className="py-2.5 pl-4 text-right text-[15px] font-bold whitespace-nowrap">{whole(result.prizes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm leading-5 font-semibold">Amounts in $CUT. A model of crowds, not a forecast: real people will do things no model guesses. Same seed, same result.</p>
    </section>
  );
}

/* ---------------------------------------------------------------- Cuts */

function CutsTab({ inside }: { inside: Inside }) {
  const cuts = inside.pastCuts;
  const day = relativeUtcDay(new Date(inside.renderedAt), inside.cutAt);
  const stats = [
    { label: "Cuts run", value: formatCount(inside.cutIndex - 1), icon: CalendarDays, tone: "bg-paper" },
    { label: "Robots deleted", value: formatCount(inside.cutIndex - 1), icon: Scissors, tone: "bg-orange" },
    { label: "$CUT burned", value: cut(inside.burned), icon: Flame, tone: "bg-paper" },
  ];

  return (
    <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-6">
      <div className="grid grid-cols-3 gap-2 lg:order-2 lg:grid-cols-1 lg:gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className={cn("rounded-2xl border-2 border-ink px-2.5 py-2 lg:flex lg:h-20 lg:items-center lg:gap-3.5 lg:rounded-3xl lg:px-[18px] lg:shadow-hard", stat.tone)}>
            <span className="lg:flex lg:size-10 lg:items-center lg:justify-center lg:rounded-xl lg:border-2 lg:border-ink lg:bg-paper">
              <stat.icon aria-hidden="true" className="size-3.5 lg:size-[18px]" strokeWidth={2.6} />
            </span>
            <span className="mt-1 block text-xs font-extrabold lg:mt-0 lg:grow lg:text-[15px]">{stat.label}</span>
            <span className="block font-heading text-[26px] leading-7 font-extrabold lg:text-[40px]">{stat.value}</span>
          </div>
        ))}
      </div>
      <Card aria-labelledby="past-title" className="px-4 pt-3 pb-3 lg:order-1 lg:px-[22px] lg:pt-4 lg:pb-5">
        <h2 id="past-title" className="font-heading text-lg font-extrabold lg:text-2xl">
          Past cuts
        </h2>
        <ul className="mt-2 flex flex-col gap-3 lg:mt-3">
          {inside.lowest && (
            <li className="flex items-center gap-3 lg:gap-5 lg:rounded-3xl lg:border-2 lg:border-ink lg:p-3.5">
              <Image
                src={STAGE_ART.src}
                alt=""
                width={STAGE_ART.width}
                height={STAGE_ART.height}
                className="hidden aspect-[3/2] w-[260px] rounded-2xl border-2 border-ink object-cover lg:block"
              />
              <span className="w-14 shrink-0 text-[13px] font-extrabold text-ink-3 lg:hidden">{formatUtcDate(inside.cutAt).split(", ")[1]}</span>
              <span className="min-w-0 grow">
                <span className="hidden items-center gap-2.5 lg:flex">
                  <span className="font-heading text-[28px] font-extrabold">{formatUtcDate(inside.cutAt).split(", ")[1]}</span>
                  <span className="rounded-full border-[1.5px] border-ink bg-lime px-2.5 text-xs leading-[22px] font-extrabold">Next</span>
                </span>
                <span className="block text-[15px] font-extrabold lg:mt-1 lg:text-xl">
                  {inside.cutIndex === 1 ? "First cut" : `Cut ${inside.cutIndex}`} · {day ?? formatUtcDate(inside.cutAt)}, {formatUtcTime(inside.cutAt)} UTC
                </span>
                <span className="block text-sm leading-5 text-ink-3 lg:mt-1 lg:text-base lg:leading-[23px] lg:text-ink-2">
                  {inside.lowest.name} is on the block with {cut(inside.lowest.pile)} $CUT.{cuts.length === 0 ? " Nothing deleted yet." : ""}
                </span>
              </span>
              <span className="shrink-0 rounded-full border-[1.5px] border-ink bg-lime px-2.5 text-[13px] leading-6 font-extrabold lg:hidden">Next</span>
            </li>
          )}
          {cuts.map((item) => (
            <li key={item.index} className="flex items-center gap-3 border-t-[1.5px] border-canvas pt-3">
              <span className="w-14 shrink-0 text-[13px] font-extrabold text-ink-3">{formatUtcDate(item.at).split(", ")[1]}</span>
              <span className="min-w-0 grow">
                <span className="block text-[15px] font-extrabold">
                  Cut {item.index} · {item.deletedName} deleted
                </span>
                <span className="block text-sm leading-5 text-ink-3">
                  {cut(item.pile)} pile · {cut(item.burned)} burned · {cut(item.prize)} prize{item.joinedName ? ` · ${item.joinedName} took the seat` : ""} · run by {item.runner}
                </span>
              </span>
              <Link href="/receipts" className="shrink-0 text-[13px] font-extrabold text-blue underline">
                Receipts
              </Link>
            </li>
          ))}
        </ul>
        {cuts.length === 0 && (
          <p className="mt-3 text-[13.5px] leading-5 text-ink-3 lg:text-sm">
            Day {inside.cutIndex + 1}: no cut has run yet. After each cut this lists who was deleted, who came in, how much burned and the Director’s line, with receipts on NEAR.
          </p>
        )}
      </Card>
    </div>
  );
}
