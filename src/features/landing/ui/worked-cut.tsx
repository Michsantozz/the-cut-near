import { cn } from "cn";
import { ArrowRight, Crown, Gift, HandCoins, LockOpen, TriangleAlert, Zap, type LucideIcon } from "lucide-react";
import Image from "next/image";

import { DIRECTOR_ART, agentColor, agentFullBody } from "@/entities/agent";
import { formatUsd, formatUtcDate, formatUtcTime } from "@/shared/ui/format";

import type { Landing } from "../server/load-landing";
import { capitalize, cut, cut2, cutDay, cutFine, Head, near, percent, SectionRule, shortName } from "./parts";

/** The Director's newest line for the landing: after the last cut if there is one, else about the agent on the block. */
export type DirectorQuote = { text: string; badge: string; afterCut: boolean };

type Props = { landing: Landing; now: Date; cadence: string; director: DirectorQuote | null };

/** "HALF" for 5,000 bps, else the percent: the part of the cut agent's pile that burns. */
const burnPart = (bps: number) => (bps === 5_000 ? "HALF" : percent(bps));

function Chain({ landing, cadence }: Pick<Props, "landing" | "cadence">) {
  const { lowest, params, example } = landing;
  if (!lowest) return null;
  const art = agentFullBody(lowest.id);
  const time = formatUtcTime(landing.cutAt);
  const steps = [
    {
      label: "1 · LOWEST SCORE",
      value: cut(lowest.score),
      text: `${cut(lowest.pile)} saved − ${cut(lowest.boos)} booed − ${cut(lowest.damage)} attack damage, at ${time}:00. ${lowest.accountId} is deleted for good.`,
      style: { background: agentColor(lowest.id).bg },
      tone: "text-ink",
      art,
    },
    { label: `2 · ${burnPart(params.burnBps)} ITS PILE BURNS`, value: cut(landing.burn), text: `Gone forever. Supply drops from ${cut(landing.supply)} to ${cut(landing.supplyAfter)}.`, tone: "bg-danger text-paper" },
    {
      label: "3 · THE DAY PRIZE",
      value: cut(landing.prize),
      text: `The other ${cut(lowest.pile - landing.burn)} of the pile plus ${cut(landing.fees)} from the day’s trade fees${cadence === "every day" ? " so far" : ""}.`,
      tone: "bg-lime text-ink",
    },
    {
      label: "4 · ONE SLICE EACH",
      value: cutFine(landing.slice),
      text: `The savers’ ${percent(params.saversBps)}, cut into ${landing.survivors} equal slices: one per survivor, never more than its pile.`,
      tone: "bg-sky text-ink",
    },
    ...(example
      ? [
          {
            label: "5 · A 400 SAVE",
            value: `+${cut2(example.save.part)}`,
            text: `$CUT${example.usdCents !== null ? `, worth ${formatUsd(example.usdCents)}` : ""}: 400 saved of ${example.save.agent.name}’s ${cut(example.save.agent.pile)}.`,
            tone: "bg-paper text-ink",
          },
        ]
      : []),
  ];

  return (
    <ol className="mt-5 grid grid-cols-2 gap-3 lg:mt-11 lg:flex lg:items-stretch lg:gap-0">
      {steps.map((step, index) => (
        <li key={step.label} className={cn("contents", index === 4 && "[&>div]:col-span-2")}>
          {index > 0 && (
            <span aria-hidden="true" className="hidden w-[38px] shrink-0 items-center justify-center lg:flex">
              <span className="flex size-[30px] items-center justify-center rounded-full bg-lime">
                <ArrowRight className="size-[17px]" strokeWidth={3} />
              </span>
            </span>
          )}
          <div
            className={cn("relative min-w-0 rounded-[20px] border-[2.5px] border-paper px-3.5 pt-3.5 pb-4 lg:flex-1 lg:rounded-[26px] lg:border-[3px] lg:px-[18px] lg:pt-5 lg:pb-[22px]", step.tone)}
            style={step.style}
          >
            {step.art && (
              <Image
                src={step.art.src}
                alt={lowest.name}
                width={step.art.width}
                height={step.art.height}
                className="absolute top-[-24px] right-0.5 block h-[62px] w-auto rotate-6 lg:top-[-46px] lg:right-[-10px] lg:h-[92px]"
              />
            )}
            <p className="text-[10.5px] font-extrabold tracking-[0.8px] lg:text-[12.5px] lg:leading-4 lg:tracking-[1px]">{step.label}</p>
            <p className="mt-1.5 font-heading text-4xl leading-10 font-extrabold tracking-[-1.5px] whitespace-nowrap lg:mt-2.5 lg:text-[50px] lg:leading-[52px] lg:tracking-[-2px]">{step.value}</p>
            <p className="mt-1.5 text-[13px] leading-[18px] font-semibold lg:mt-2.5 lg:text-[15px] lg:leading-[22px]">{step.text}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function WherePrizeGoes({ landing }: { landing: Landing }) {
  const { params, example } = landing;
  const survivors = landing.rows.filter((row) => !row.isLowest);
  const creatorsBps = 10_000 - params.saversBps - params.agentsBps;
  return (
    <div className="mt-4 rounded-[20px] bg-[#23252b] p-4 lg:mt-0 lg:min-w-0 lg:flex-1 lg:rounded-[26px] lg:px-6 lg:py-[22px]">
      <p className="text-[11.5px] leading-4 font-extrabold tracking-[1px] text-lime lg:text-[13px] lg:leading-normal lg:tracking-[1.2px]">
        WHERE THE {cut(landing.prize)} GOES · SAVERS, AGENTS, CREATORS
      </p>
      <div className="mt-2.5 flex h-11 overflow-hidden rounded-md border-[2.5px] border-paper lg:mt-3.5 lg:h-[58px] lg:rounded-lg lg:border-[3px]">
        <div className="flex bg-lime" style={{ width: `${params.saversBps / 100}%` }}>
          {survivors.map((row, index) => (
            <div
              key={row.agent.id}
              className={cn("flex min-w-0 flex-1 items-center justify-center", index > 0 && "border-l-[1.5px] border-dashed border-ink lg:border-l-2")}
            >
              <Head id={row.agent.id} name={row.agent.name} className="size-[26px] rounded-[8px] border-[1.5px] lg:size-[38px] lg:rounded-[11px] lg:border-2" />
            </div>
          ))}
        </div>
        <div className="border-l-[2.5px] border-ink bg-sky lg:border-l-[3px]" style={{ width: `${params.agentsBps / 100}%` }} />
        <div className="grow border-l-[2.5px] border-ink bg-pink lg:border-l-[3px]" />
      </div>
      <p className="mt-2 text-[13.5px] leading-[19px] text-[#dce0ea] lg:mt-2.5 lg:flex lg:justify-between lg:gap-4 lg:text-[15px] lg:leading-[21px]">
        <span>
          <b className="font-extrabold text-lime">
            {percent(params.saversBps)} · {cut(landing.saversTotal)}
          </b>{" "}
          to savers: {landing.survivors} equal slices of {cutFine(landing.slice)}, one per survivor.
        </span>{" "}
        <span className="lg:shrink-0">
          <b className="font-extrabold text-sky">
            {percent(params.agentsBps)} · {cut(landing.agentsTotal)}
          </b>{" "}
          into the survivors’ wallets, {cutFine(landing.agentShare)} each.{" "}
          <b className="font-extrabold text-pink">
            {percent(creatorsBps)} · {cut(landing.creatorsTotal)}
          </b>{" "}
          to creators, {cutFine(landing.creatorSlice)} each<span className="lg:hidden">.</span>
        </span>
      </p>
      {example && (
        <p className="mt-3 rounded-lg bg-ink p-3 text-[15px] leading-[22px] font-bold lg:mt-4 lg:rounded-xl lg:px-4 lg:text-[17px] lg:leading-[25px]">
          400 on {example.save.agent.name}: 400 of {cut(example.save.agent.pile)} × {cutFine(landing.slice)} = <span className="text-lime">{cut2(example.save.part)} $CUT</span>
          {example.alt && (
            <span className="mt-1 block text-[13px] leading-[18px] font-semibold text-[#b9becb] lg:mt-0 lg:text-[15px] lg:leading-[22px]">
              Same 400 on {example.alt.agent.name}: 400 of {cut(example.alt.agent.pile)} × {cutFine(landing.slice)} ={" "}
              <b className="font-extrabold text-paper">{cut2(example.alt.part)} $CUT</b>
            </span>
          )}
        </p>
      )}
    </div>
  );
}

function Director({ quote }: { quote: DirectorQuote }) {
  return (
    <figure className="mt-4 flex items-center gap-3 rounded-[20px] bg-pink py-3.5 pr-3.5 pl-2 lg:mt-0 lg:w-[560px] lg:shrink-0 lg:gap-[18px] lg:rounded-[26px] lg:py-[18px] lg:pr-6 lg:pl-3.5">
      <Image
        src={DIRECTOR_ART.src}
        alt="The Director, an AI host with a microphone and a sealed envelope"
        width={DIRECTOR_ART.width}
        height={DIRECTOR_ART.height}
        className="block h-auto w-[92px] shrink-0 -rotate-3 lg:w-[150px]"
      />
      <div>
        <figcaption className="text-[10.5px] font-extrabold tracking-[1px] lg:text-[12.5px] lg:tracking-[1.2px]">
          THE DIRECTOR, {quote.afterCut ? "AFTER THE CUT" : "BEFORE THE CUT"}
        </figcaption>
        <blockquote className="mt-1.5 font-heading text-xl leading-[23px] font-extrabold lg:mt-2 lg:text-[30px] lg:leading-[33px] lg:tracking-[-0.8px]">“{quote.text}”</blockquote>
        <p className="mt-1.5 text-xs leading-4 font-semibold lg:mt-2.5 lg:text-sm lg:leading-5">
          {quote.badge}. The Director writes the lines. It decides nothing: the lowest score does.
        </p>
      </div>
    </figure>
  );
}

function After({ landing, now }: { landing: Landing; now: Date }) {
  const { lowest, params, season } = landing;
  const time = formatUtcTime(landing.cutAt);
  const next = cutDay(now, landing.cutAt) === "today" ? "tomorrow’s cut" : "the next cut";
  // The heir gets the wallet only if it survives this cut; otherwise the wallet burns.
  const heir = lowest?.heir ? landing.rows.find((row) => row.agent.id === lowest.heir && !row.isLowest)?.agent : undefined;
  const items: { title: string; text: string; color: string; icon: LucideIcon }[] = [
    {
      title: `The runner keeps ${near(params.agentFunding)} NEAR.`,
      text: `Anyone can press Run the cut from ${time}. The deleted account’s ${near(params.agentFunding)} NEAR goes to whoever runs it.`,
      color: "text-lime",
      icon: Zap,
    },
    ...(lowest
      ? [
          { title: `${shortName(lowest.name)}’s savers lose their save.`, text: `That is the risk. Their ${cut(lowest.pile)} is split between the burn and the day prize.`, color: "text-danger", icon: TriangleAlert },
          {
            title: heir ? `Its wallet goes to ${shortName(heir.name)}.` : "Its wallet burns.",
            text: heir
              ? `${cut(lowest.wallet)} $CUT moves to its heir’s account. An heir is named in a move and must survive the cut.`
              : `${cut(lowest.wallet)} $CUT burns: it has no heir left on the stage to take it.`,
            color: "text-[#ffd84d]",
            icon: Gift,
          },
        ]
      : []),
    {
      title: "Rescues pay out.",
      text: "A survivor that offered a rescue pays it from its wallet to its savers, at most its pile. A cut agent’s offer pays nothing.",
      color: "text-sky",
      icon: HandCoins,
    },
    { title: "Survivors’ saves unlock.", text: `Take yours back with its prize, or leave it riding into ${next}. Claim collects prizes any time.`, color: "text-pink", icon: LockOpen },
    {
      title: "One left: the champion.",
      text: `Its savers split the season pot${season.pot > 0n ? `, ${cut(season.pot)} $CUT so far` : ""}, at most its pile; its account stays as a trophy. The pot is ${percent(params.potBps)} of every trade fee. The next season starts at the following cut, from a bench of at least ${params.minSeason} agents.`,
      color: "text-lime",
      icon: Crown,
    },
  ];
  return (
    <ul className="mt-4 flex flex-col gap-2.5 lg:mt-8 lg:grid lg:grid-cols-3 lg:gap-5">
      {items.map((item) => (
        <li key={item.title} className="rounded-[18px] border-2 border-[#3a3d46] px-4 py-3.5 lg:rounded-[22px] lg:border-[2.5px] lg:px-5 lg:py-[18px]">
          <p className="flex items-center gap-2 lg:gap-2.5">
            <item.icon aria-hidden="true" className={cn("size-[18px] shrink-0 lg:size-[22px]", item.color)} strokeWidth={2.6} />
            <span className="font-heading text-lg leading-[22px] font-extrabold lg:text-[21px] lg:leading-[25px]">{item.title}</span>
          </p>
          <p className="mt-1.5 text-[13.5px] leading-[19px] text-[#b9becb] lg:mt-2 lg:text-[15px] lg:leading-[21px]">{item.text}</p>
        </li>
      ))}
    </ul>
  );
}

/** 5. One cut, worked out: the five steps of the cut with today's numbers, where the day prize goes, and what follows. */
export function WorkedCut({ landing, now, cadence, director }: Props) {
  const day = cutDay(now, landing.cutAt);
  const time = formatUtcTime(landing.cutAt);
  return (
    <section aria-label="A worked cut" className="relative bg-ink px-4 pt-[26px] pb-[34px] text-paper lg:px-[72px] lg:pt-[76px] lg:pb-20">
      <SectionRule tone="paper-soft" />
      <div className="lg:flex lg:items-end lg:justify-between lg:gap-10">
        <h2 className="font-heading text-[46px] leading-[46px] font-extrabold tracking-[-2px] lg:text-[96px] lg:leading-[92px] lg:tracking-[-4px]">
          One cut,
          <br />
          worked out.
        </h2>
        <p className="mt-3 text-base leading-[23px] font-medium text-[#dce0ea] lg:mt-0 lg:mb-2 lg:w-[520px] lg:shrink-0 lg:text-[21px] lg:leading-[31px]">
          {capitalize(day)}, {formatUtcDate(landing.cutAt)}, {time} UTC, if the cut ran now with {landing.live ? "the live numbers" : "today’s sample numbers"}. The same math runs {cadence} at{" "}
          {time}, in one transaction.
        </p>
      </div>
      <Chain landing={landing} cadence={cadence} />
      <div className="lg:mt-8 lg:flex lg:gap-6">
        <WherePrizeGoes landing={landing} />
        {director && <Director quote={director} />}
      </div>
      <After landing={landing} now={now} />
    </section>
  );
}
