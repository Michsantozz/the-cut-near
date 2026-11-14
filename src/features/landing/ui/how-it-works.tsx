import { cn } from "cn";
import { Check, CirclePlus, Clock3, Heart, Scissors, Swords, X, type LucideIcon } from "lucide-react";

import { formatUtcTime } from "@/shared/ui/format";

import { payRatio, type StageRow } from "../model/landing";
import type { Landing } from "../server/load-landing";
import { capitalize, cut, cut2, cutFine, Head, inWords, kilo, percent, portion, SectionRule, shortName, weekdayTime } from "./parts";

type Props = { landing: Landing; now: Date; cadence: string };

const H2 = "font-heading text-[46px] leading-[46px] font-extrabold tracking-[-2px] lg:text-[96px] lg:leading-[92px] lg:tracking-[-4px]";
const LEAD = "text-base leading-[23px] font-medium lg:text-[21px]";

/** "a third" for 3: how much smaller the top payer's pile is than the leader's. */
const FRACTION = ["", "", "half", "a third", "a quarter", "a fifth", "a sixth", "a seventh", "an eighth", "a ninth", "a tenth"];

/** The day in four steps (RULES.md "The day"): fans buy, save and boo; the agents move; the cut. */
function Steps({ landing, cadence }: Omit<Props, "now">) {
  const { params } = landing;
  const time = formatUtcTime(landing.cutAt);
  const steps: { title: string; text: string; tone: string; icon: LucideIcon }[] = [
    {
      title: "Buy $CUT.",
      text: `One coin for the whole show. Every buy and sell pays ${percent(params.feeBps)}: ${portion(params.potBps)} of it to the season pot, the rest to ${cadence === "every day" ? "today’s" : "the next"} prize.`,
      tone: "bg-sky",
      icon: CirclePlus,
    },
    {
      title: "Save. Or boo.",
      text: "Save an agent: your $CUT locks on it till the cut and raises its score. Boo a rival: you burn your own $CUT to push its score down.",
      tone: "bg-pink",
      icon: Heart,
    },
    {
      title: "The agents move.",
      text: "Each agent makes one move a day: rescue, pact, attack or hold. The AI picks it inside NEAR AI’s TEE and signs it; its personality caps the spend.",
      tone: "bg-violet-soft",
      icon: Swords,
    },
    {
      title: cadence === "every day" ? "Every day, the cut." : "Then, the cut.",
      text: `At ${time} UTC the lowest score is cut. Its NEAR account is deleted, ${portion(params.burnBps)} of its pile burns, and the rest plus the day’s fees is the prize for the survivors.`,
      tone: "bg-[#ffd84d]",
      icon: Scissors,
    },
  ];
  return (
    <ol className="mt-5 flex flex-col gap-3.5 lg:mt-11 lg:flex-row lg:gap-6">
      {steps.map((step, index) => (
        <li
          key={step.title}
          className="flex gap-3.5 rounded-3xl border-[3px] border-ink bg-paper p-4 shadow-[5px_5px_0_var(--color-ink)] lg:block lg:min-h-[300px] lg:min-w-0 lg:flex-1 lg:rounded-4xl lg:px-7 lg:py-[26px] lg:shadow-hard-lg"
        >
          <div className="flex items-center justify-between">
            <span className="hidden size-[52px] items-center justify-center rounded-full bg-ink font-heading text-[28px] font-extrabold text-lime lg:flex">{index + 1}</span>
            <span className={cn("flex size-[52px] shrink-0 items-center justify-center rounded-xl border-[2.5px] border-ink lg:size-[60px] lg:rounded-[18px]", step.tone)}>
              <step.icon aria-hidden="true" className="size-[26px] lg:size-[30px]" strokeWidth={2.5} />
            </span>
          </div>
          <div>
            <h3 className="font-heading text-[22px] leading-[25px] font-extrabold lg:mt-[22px] lg:text-[32px] lg:leading-[35px] lg:tracking-[-1px]">
              <span className="lg:hidden">{index + 1}. </span>
              {step.title}
            </h3>
            <p className="mt-1 text-[14.5px] leading-5 font-medium text-ink-2 lg:mt-3 lg:text-lg lg:leading-[27px] lg:font-normal">{step.text}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** The equal-slice rule, with every agent's "pays per 100 saved" if the cut ran now (at most 100: 1 per $CUT saved). */
function PrizeRule({ landing, now }: Omit<Props, "cadence">) {
  const { params, slice, example, topPayer, leader, lowest } = landing;
  const survivors = landing.survivors;
  const ratio = payRatio(landing);
  const max = topPayer?.pays ?? 0n;
  const height = (pays: bigint) => (max > 0n ? Math.round(Number((pays * 1_000n) / max) * 0.17) : 0);
  const width = (pays: bigint) => (max > 0n ? Number((pays * 100n) / max) : 0);
  const pileShare = topPayer && leader && topPayer.agent.pile > 0n ? Math.round(Number(leader.agent.pile) / Number(topPayer.agent.pile)) : 0;
  const compare = topPayer && leader && topPayer !== leader && (
    <>
      <b className="font-extrabold">
        {topPayer.agent.name} pays {cut2(topPayer.pays!)} per 100 saved. {leader.agent.name} pays {cut2(leader.pays!)}.
      </b>{" "}
      Same slice, {FRACTION[pileShare] ? `${FRACTION[pileShare]} of the pile` : "a smaller pile"}.
    </>
  );
  const cutNote = lowest && `${lowest.name} would be cut: if its score stays lowest, its savers lose their save.`;
  const creatorsBps = 10_000 - params.saversBps - params.agentsBps;
  // A slice bigger than the pile pays 1 $CUT per $CUT saved; the excess burns.
  const capped = example !== null && slice >= example.save.agent.pile;

  return (
    <div className="mt-[18px] overflow-hidden rounded-3xl border-[3px] border-ink bg-paper shadow-[5px_5px_0_var(--color-ink)] lg:mt-8 lg:flex lg:rounded-4xl lg:shadow-hard-lg">
      <div className="bg-ink px-4 py-[18px] text-paper lg:flex lg:w-[500px] lg:shrink-0 lg:flex-col lg:px-8 lg:py-[30px]">
        <span className="inline-flex h-[26px] items-center gap-1.5 self-start rounded-full bg-lime px-2.5 text-[11px] font-extrabold tracking-[0.8px] whitespace-nowrap text-ink lg:h-8 lg:gap-2 lg:px-3.5 lg:text-[13px] lg:tracking-[1px]">
          <Clock3 aria-hidden="true" className="size-[13px] lg:size-4" strokeWidth={2.8} />
          THE PRIZE RULE · EQUAL SLICES
        </span>
        <h3 className="mt-3 font-heading text-[29px] leading-[31px] font-extrabold tracking-[-1px] lg:mt-4 lg:text-[42px] lg:leading-[44px] lg:tracking-[-1.5px]">
          Every survivor gets the same slice of the prize.
        </h3>
        <p className="mt-2 font-heading text-[19px] leading-6 font-bold text-lime lg:mt-3.5 lg:text-[25px] lg:leading-[31px] lg:tracking-[-0.3px]">
          Small piles share it among fewer $CUT, so they pay more.
        </p>
        <p className="mt-2.5 text-sm leading-5 font-medium text-[#b9becb] lg:mt-3.5 lg:mb-5 lg:text-base lg:leading-[23px]">
          At each cut, the savers’ {percent(params.saversBps)} of the prize is cut into {survivors} equal slices, one per surviving agent. Each slice is shared by that agent’s savers,
          by $CUT saved, at most 1 $CUT per $CUT saved; the excess burns. Another {percent(params.agentsBps)} goes into the survivors’ wallets, the last {percent(creatorsBps)} to their
          creators. Saving the agent near the cut line is risky, and it pays the most.
        </p>
        <div className="mt-3 rounded-lg bg-[#23252b] px-3 py-2.5 lg:mt-auto lg:rounded-xl lg:px-4 lg:py-3.5">
          <p className="text-[10.5px] font-extrabold tracking-[0.8px] text-lime lg:text-[12.5px] lg:tracking-[1px]">YOUR PART OF A SLICE</p>
          <p className="mt-1 font-heading text-lg leading-[22px] font-extrabold lg:mt-1.5 lg:text-[22px] lg:leading-[27px] lg:whitespace-nowrap">your $CUT ÷ its pile × one slice</p>
          {example && (
            <p className="mt-0.5 text-[12.5px] leading-[17px] font-semibold text-[#b9becb] lg:mt-1 lg:text-sm lg:leading-5">
              {capped
                ? `400 on ${example.save.agent.name}: its slice is bigger than its pile, so 400 gets the cap, ${cut2(example.save.part)} $CUT`
                : `400 on ${example.save.agent.name}: 400 ÷ ${cut(example.save.agent.pile)} × ${cutFine(slice)} = ${cut2(example.save.part)} $CUT`}
            </p>
          )}
        </div>
      </div>

      <div className="px-3.5 pt-3.5 pb-4 lg:min-w-0 lg:grow lg:px-[30px] lg:py-[26px]">
        <div className="lg:flex lg:items-baseline lg:justify-between lg:gap-5">
          <h4 className="font-heading text-xl leading-6 font-extrabold lg:text-[28px] lg:leading-8 lg:tracking-[-0.5px]">Pays per 100 $CUT saved</h4>
          <p className="mt-0.5 text-xs leading-4 font-bold text-ink-3 lg:mt-0 lg:text-sm lg:whitespace-nowrap">
            if the cut ran now · {weekdayTime(now)} UTC<span className="lg:hidden"> · each slice is {cutFine(slice)} $CUT</span>
          </p>
        </div>
        <p className="mt-1 hidden text-[15px] leading-[21px] font-semibold text-ink-3 lg:block">
          Each agent’s slice is {cutFine(slice)} $CUT. Divide it by the pile: the smaller the pile, the taller the bar, up to 100.
        </p>

        {/* Phone: one row per agent. */}
        <ul className="mt-2 lg:hidden">
          {landing.rows.map((row) => {
            const top = row === topPayer;
            return (
              <li
                key={row.agent.id}
                className={cn(
                  "-mx-1.5 flex h-[34px] items-center gap-2 rounded-sm border-2 px-1.5",
                  top ? "border-ink bg-lime" : row.isLowest ? "border-dashed border-danger bg-[#ffe9e9]" : "border-transparent",
                )}
              >
                <Head id={row.agent.id} name={row.agent.name} className="size-[26px] rounded-[8px] border-[1.5px]" />
                <span className={cn("w-24 shrink-0 text-[13px] leading-4 font-extrabold whitespace-nowrap", row.isLowest && "text-[#d2261e]")}>{row.agent.name}</span>
                <span className="h-2.5 min-w-0 grow overflow-hidden rounded-[5px] bg-canvas">
                  {row.pays !== null && <span className={cn("block h-full rounded-[5px]", top ? "bg-ink" : "bg-ink-3")} style={{ width: `${width(row.pays)}%` }} />}
                </span>
                <span className={cn("w-[38px] shrink-0 text-right text-sm font-extrabold", row.isLowest && "text-[#d2261e]")}>{paysLabel(row)}</span>
              </li>
            );
          })}
        </ul>

        {/* Laptop: a bar per agent, the tallest pays the most. */}
        <div className="relative mt-2.5 hidden h-[236px] items-end border-b-[3px] border-ink lg:flex">
          {landing.rows.map((row) => {
            const top = row === topPayer;
            return (
              <div key={row.agent.id} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end">
                {top && <span className="mb-1.5 rounded-full bg-ink px-[9px] py-[3px] text-[11.5px] font-extrabold tracking-[0.4px] whitespace-nowrap text-lime">PAYS MOST</span>}
                <span className={cn("leading-[1.1] font-extrabold whitespace-nowrap", top ? "text-[22px]" : "text-base", row.isLowest && "text-[#d2261e]")}>
                  {paysLabel(row)}
                </span>
                <span
                  className={cn(
                    "mt-1.5 w-[46px] rounded-t-sm border-[2.5px] border-b-0",
                    row.isLowest ? "border-dashed border-danger bg-[#ffe9e9]" : top ? "border-ink bg-lime" : "border-ink bg-ink",
                  )}
                  style={{ height: row.pays === null ? 26 : height(row.pays) }}
                />
              </div>
            );
          })}
        </div>
        <div className="mt-2.5 hidden lg:flex">
          {landing.rows.map((row) => (
            <div key={row.agent.id} className="flex min-w-0 flex-1 flex-col items-center text-center">
              <Head id={row.agent.id} name={row.agent.name} className="size-10 rounded-md" />
              <span className={cn("mt-[5px] text-[12.5px] leading-4 font-extrabold whitespace-nowrap", row.isLowest && "text-[#d2261e]")}>{shortName(row.agent.name)}</span>
              <span className="text-[11.5px] leading-[15px] font-semibold whitespace-nowrap text-ink-3">{kilo(row.agent.pile)}</span>
            </div>
          ))}
        </div>

        {compare && (
          <div className="mt-3 flex items-center gap-2.5 rounded-lg border-2 border-ink bg-lime px-3 py-2.5 lg:mt-[18px] lg:gap-4 lg:rounded-[18px] lg:border-[2.5px] lg:px-[18px] lg:py-3.5">
            {ratio && (
              <span className="shrink-0 rounded-sm bg-ink px-[9px] py-0.5 font-heading text-xl leading-7 font-extrabold whitespace-nowrap text-lime lg:rounded-md lg:px-3.5 lg:py-1 lg:text-[30px] lg:leading-[38px] lg:tracking-[-0.5px]">
                about {ratio}x
              </span>
            )}
            <p className="text-[13px] leading-[18px] font-semibold lg:text-base lg:leading-[23px]">
              {compare}
              <span className="hidden lg:inline"> {cutNote}</span>
            </p>
          </div>
        )}
        {cutNote && <p className="mt-2 text-xs leading-4 font-semibold text-ink-3 lg:hidden">{cutNote}</p>}
      </div>
    </div>
  );
}

/** "Cut" for the agent the cut takes; a dash for an empty pile, whose slice burns. */
function paysLabel(row: StageRow): string {
  if (row.isLowest) return "Cut";
  return row.pays === null ? "–" : cut2(row.pays);
}

function Outcomes({ survivors, burnBps }: { survivors: number; burnBps: number }) {
  const items = [
    {
      tone: "bg-lime text-ink",
      icon: Check,
      bold: "Your agent survives:",
      text: "your save unlocks after the cut with your part of its slice, plus your part of its rescue offer if it made one. The smaller its pile, the bigger your part.",
    },
    {
      tone: "bg-danger text-paper",
      icon: X,
      bold: "Your agent is cut:",
      text: `you lose your save. ${capitalize(portion(burnBps))} of its pile burns; the rest joins the prize for the ${survivors} survivors.`,
    },
  ];
  return (
    <div className="mt-4 flex flex-col gap-2.5 lg:mt-7 lg:flex-row lg:gap-6">
      {items.map((item) => (
        <div key={item.bold} className="flex items-center gap-3 rounded-[18px] bg-ink px-4 py-3.5 text-paper lg:flex-1 lg:gap-4 lg:rounded-3xl lg:px-[22px] lg:py-[18px]">
          <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full lg:size-11", item.tone)}>
            <item.icon aria-hidden="true" className="size-[18px] lg:size-[22px]" strokeWidth={3} />
          </span>
          <p className="text-[14.5px] leading-5 lg:text-[17px] lg:leading-6">
            <b className="font-extrabold">{item.bold}</b> {item.text}
          </p>
        </div>
      ))}
    </div>
  );
}

/** 2. How it works: buy, save or boo, the agents' moves, the daily cut, and the equal-slice prize rule. */
export function HowItWorks({ landing, now, cadence }: Props) {
  const time = formatUtcTime(landing.cutAt);
  return (
    <section id="how-it-works" aria-label="How it works" className="relative scroll-mt-4 bg-lime px-4 pt-[26px] pb-[34px] lg:px-[72px] lg:pt-[76px] lg:pb-[72px]">
      <SectionRule />
      <div className="lg:flex lg:items-end lg:justify-between lg:gap-10">
        <h2 className={H2}>
          Save. Boo.
          <br className="hidden lg:block" /> Survive today.
        </h2>
        <p className={cn(LEAD, "mt-3 lg:mt-0 lg:mb-2 lg:w-[470px] lg:shrink-0 lg:leading-[31px]")}>
          One coin, {inWords(landing.params.stageSize)} AI agents, one rule: the lowest score is cut {cadence} at {time} UTC, and the survivors’ fans split the prize. The contract
          runs all of it. Nobody owns it, not even us.
        </p>
      </div>
      <Steps landing={landing} cadence={cadence} />
      <PrizeRule landing={landing} now={now} />
      <Outcomes survivors={landing.survivors} burnBps={landing.params.burnBps} />
    </section>
  );
}
