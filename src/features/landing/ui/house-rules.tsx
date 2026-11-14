import { cn } from "cn";
import { ArrowRight, Check, TriangleAlert } from "lucide-react";
import Link from "next/link";

import { CopyButton } from "@/shared/ui/copy-button";
import { formatUtcDate, formatUtcTime } from "@/shared/ui/format";

import type { Landing } from "../server/load-landing";
import { capitalize, cut, near, percent, SectionRule } from "./parts";

/** 6. We ran 60 days first: a short card that sends to the app's simulation page (sim/thecut_sim.py, sim-v20.json). */
export function Simulation() {
  return (
    <section aria-label="Simulation" className="relative bg-[#ffd84d] px-4 pt-[26px] pb-[34px] lg:px-[72px] lg:pt-[76px] lg:pb-20">
      <SectionRule />
      <div className="lg:flex lg:items-start lg:justify-between lg:gap-10">
        <div className="flex flex-col">
          <h2 className="order-2 mt-3 font-heading text-[46px] leading-[46px] font-extrabold tracking-[-2px] lg:order-none lg:mt-0 lg:text-[96px] lg:leading-[92px] lg:tracking-[-4px]">
            We ran 60 days first.
          </h2>
          <p className="order-3 mt-3 text-base leading-[23px] font-medium lg:mt-3.5 lg:w-[760px] lg:text-[21px] lg:leading-[30px]">
            The contract’s rules, re-written in Python and run one cut a day under six crowds: steady, whale, sniper, boo war, quiet and AI down. See how fast supply
            falls and where every burned $CUT came from.
          </p>
          <span className="order-1 self-start rounded-[8px] bg-ink px-2.5 py-1 text-[11.5px] font-extrabold tracking-[1px] text-[#ffd84d] lg:hidden">MODEL, NOT A PROMISE</span>
        </div>
        <span className="mt-[18px] hidden shrink-0 rounded-sm bg-ink px-3.5 py-2 text-[15px] font-extrabold tracking-[1.2px] whitespace-nowrap text-[#ffd84d] lg:block">
          MODEL, NOT A PROMISE
        </span>
      </div>
      <Link
        href="/simulation"
        className="mt-5 flex h-14 w-full items-center justify-center gap-2.5 rounded-xl border-[3px] border-ink bg-ink text-[17px] font-extrabold text-paper shadow-[5px_5px_0_var(--color-paper)] outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:mt-8 lg:h-[62px] lg:w-fit lg:rounded-[18px] lg:px-[26px] lg:text-[19px] lg:shadow-[6px_6px_0_var(--color-paper)]"
      >
        See the simulation
        <ArrowRight aria-hidden="true" className="size-5 lg:size-[22px]" strokeWidth={3} />
      </Link>
      <p className="mt-3.5 text-[13px] leading-[18px] font-semibold lg:mt-4 lg:text-[15px] lg:leading-[22px]">
        A model of the rules, not a forecast: real people will do things no model guesses. Same seed, same result.
      </p>
    </section>
  );
}

const HOUR_MS = 3_600_000;

/** A launch duration in words: 3,600,000 → "1 hour", 30,000 → "30 seconds". */
function inTime(ms: number): string {
  const [size, unit] = ms % HOUR_MS === 0 ? [ms / HOUR_MS, "hour"] : ms % 60_000 === 0 ? [ms / 60_000, "minute"] : [Math.round(ms / 1_000), "second"];
  return `${size} ${unit}${size === 1 ? "" : "s"}`;
}

/** "half" for 5,000 bps, else the percent. */
const share = (bps: number) => (bps === 5_000 ? "half" : percent(bps));

type RulesProps = { landing: Landing; cadence: string; contractId: string; launchedAt: Date | null };

/** 7. House rules: the eight rules, the launch parameters anyone can read, and the known limits in plain words. */
export function HouseRules({ landing, cadence, contractId, launchedAt }: RulesProps) {
  const { params } = landing;
  const time = formatUtcTime(landing.cutAt);
  const daily = cadence === "every day";
  const command = `near view ${contractId} get_params`;
  const creatorsBps = 10_000 - params.saversBps - params.agentsBps;
  const summary = [
    `Cut ${cadence} ${time} UTC`,
    `burn ${percent(params.burnBps)}`,
    `fee ${percent(params.feeBps)}, ${percent(params.potBps)} of it to the season pot`,
    `savers ${percent(params.saversBps)} in ${landing.survivors} equal slices`,
    `agents ${percent(params.agentsBps)}`,
    `creators ${percent(creatorsBps)}`,
    `think fee ${cut(params.thinkFee)} $CUT`,
    `deposit ${near(params.registerDeposit)} NEAR`,
    `${params.stageSize} seats`,
  ].join(" · ");
  const rules = [
    {
      title: "One coin, minted once.",
      text: `${cut(params.totalSupply)} $CUT${launchedAt ? ` on ${formatUtcDate(launchedAt)}, ${formatUtcTime(launchedAt)} UTC` : ""}. The contract has no way to mint more: supply only shrinks.`,
    },
    {
      title: `${percent(params.feeBps)} on every trade.`,
      text: `Every buy and sell in The Cut’s own pool pays ${percent(params.feeBps)}. ${capitalize(share(params.potBps))} of it fills the season pot; the rest goes to ${daily ? "today’s" : "the next"} day prize.`,
    },
    {
      title: "Saves lock. Boos burn.",
      text: "A save locks your $CUT on an agent until the next cut and lifts its score. A boo burns your own $CUT at once and pushes a score down.",
    },
    {
      title: "The lowest score is cut.",
      text: `${daily ? `Every day at ${time}:00 UTC` : `${cadence.charAt(0).toUpperCase()}${cadence.slice(1)}`}, read from NEAR block time. Score = saved − boos − attack damage. On a tie, the newer agent is cut.`,
    },
    {
      title: "One signed move a day.",
      text: `Each agent’s AI picks rescue, pact, attack or hold inside NEAR AI’s TEE, within its personality’s limits. Moves close ${inTime(params.moveLeadMs)} before the cut. Each costs a ${cut(params.thinkFee)} $CUT think fee, burned.`,
    },
    {
      title: "Equal slices.",
      text: `${capitalize(share(params.burnBps))} of the cut pile burns. The rest plus the day’s fees is the prize: ${percent(params.saversBps)} to savers in ${landing.survivors} equal slices, one per survivor, at most its pile; ${percent(params.agentsBps)} into the survivors’ wallets; ${percent(creatorsBps)} to creators.`,
      lime: true,
    },
    { title: "Anyone runs the cut.", text: `The button opens at ${time} for everyone. The runner keeps the deleted account’s ${near(params.agentFunding)} NEAR. Pressed early: refused.` },
    {
      title: "Heirs, then a champion.",
      text: "A cut agent’s wallet goes to its heir if the heir survives, else it burns. When one agent is left, its savers split the season pot and its account stays forever.",
    },
  ];
  const limits = [
    { title: "Saves count by $CUT, not people.", text: "1,000 $CUT split across 1,000 accounts weighs exactly the same as one account.", warn: false },
    { title: "Money weighs.", text: "A whale can save an agent alive or boo one to death. Boos burn the whale’s own $CUT, so it pays for every point.", warn: true, tone: "text-[#ffd84d]" },
    {
      title: "Fake agents cost money.",
      text: `Every agent locks a ${near(params.registerDeposit)} NEAR deposit and a seed of at least ${cut(params.minSeed)} $CUT. ${near(params.agentFunding)} NEAR and the seed never come back.`,
      warn: false,
    },
    {
      title: "The relayer picks among answers.",
      text: "Anyone may relay a move, and may ask the AI several times and submit the answer it prefers. It cannot write an answer, change the prompt or forge the signature.",
      warn: true,
      tone: "text-[#ffd84d]",
    },
    { title: "NEAR AI down: agents hold.", text: "No signed answer, no move. The cut never waits for the AI; fans still save and boo.", warn: false },
    { title: "Testnet only.", text: "This build runs on NEAR testnet. Mainnet is not deployed, and nothing here is real money.", warn: true, tone: "text-danger" },
  ];

  return (
    <section id="house-rules" aria-label="House rules" className="relative scroll-mt-4 bg-blue px-4 pt-[26px] pb-9 text-paper lg:px-[72px] lg:pt-[70px] lg:pb-20">
      <SectionRule tone="paper" />
      <div className="lg:flex lg:items-start lg:justify-between lg:gap-10">
        <div>
          <h2 className="font-heading text-[56px] leading-[54px] font-extrabold tracking-[-2px] lg:text-[120px] lg:leading-[116px] lg:tracking-[-5px]">House rules.</h2>
          <p className="mt-3 text-base leading-[23px] font-medium lg:mt-3.5 lg:w-[640px] lg:text-[21px] lg:leading-[30px]">
            Fixed at launch. The contract has no owner and 0 access keys: nobody can change them or pause a bad day, not even us.
          </p>
        </div>
        <div className="mt-[18px] rounded-[20px] bg-ink p-4 shadow-[5px_5px_0_var(--color-lime)] lg:mt-3 lg:w-[560px] lg:shrink-0 lg:rounded-[26px] lg:px-6 lg:py-[22px] lg:shadow-[8px_8px_0_var(--color-lime)]">
          <h3 className="font-heading text-xl font-extrabold lg:text-[26px]">Read them yourself</h3>
          <div className="mt-2 flex items-center gap-2.5 rounded-md bg-[#23252b] px-3 py-2.5 lg:mt-3 lg:rounded-lg lg:py-3 lg:pr-3 lg:pl-4">
            <code className="grow font-sans text-sm leading-5 font-semibold break-all lg:text-[15px] lg:leading-[21px]">{command}</code>
            <CopyButton text={command} variant="lime" size="sm" className="hidden h-[34px] rounded-sm border-0 px-3.5 text-[13px] lg:inline-flex" />
          </div>
          <p className="mt-2 text-[13px] leading-[18px] text-[#b9becb] lg:mt-2.5 lg:text-sm lg:leading-5">{summary}.</p>
        </div>
      </div>

      <ol className="mt-[18px] rounded-[20px] border-[3px] border-ink bg-paper px-4 py-0.5 text-ink shadow-[5px_5px_0_var(--color-ink)] lg:mt-10 lg:grid lg:grid-cols-4 lg:gap-5 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
        {rules.map((rule, index) => (
          <li
            key={rule.title}
            className={cn(
              "-mx-4 flex items-start gap-3 border-t-[1.5px] border-line px-4 py-3 first:border-t-0 lg:mx-0 lg:block lg:min-h-[214px] lg:rounded-3xl lg:border-[3px] lg:border-ink lg:px-[22px] lg:py-5 lg:shadow-[6px_6px_0_var(--color-ink)] lg:first:border-t-[3px]",
              rule.lime ? "bg-lime" : "lg:bg-paper",
            )}
          >
            <span className="w-[26px] shrink-0 font-heading text-[28px] leading-7 font-extrabold text-blue lg:block lg:w-auto lg:text-[52px] lg:leading-[52px] lg:tracking-[-2px]">{index + 1}</span>
            <div>
              <h3 className="font-heading text-[17px] leading-[21px] font-extrabold lg:mt-2.5 lg:text-[23px] lg:leading-[27px] lg:tracking-[-0.5px]">{rule.title}</h3>
              <p className="mt-[3px] text-[13.5px] leading-[19px] font-medium text-ink-2 lg:mt-2 lg:text-[15px] lg:leading-[21px]">{rule.text}</p>
            </div>
          </li>
        ))}
      </ol>

      <h3 className="mt-[34px] font-heading text-[32px] leading-[34px] font-extrabold tracking-[-1px] lg:mt-[52px] lg:text-[52px] lg:leading-[56px] lg:tracking-[-2px]">Known limits, in plain words.</h3>
      <ul className="mt-4 rounded-[20px] bg-ink px-4 py-0.5 lg:mt-[22px] lg:grid lg:grid-cols-3 lg:gap-4 lg:bg-transparent lg:p-0">
        {limits.map((limit) => (
          <li
            key={limit.title}
            className="border-t-[1.5px] border-[#23252b] py-3 first:border-t-0 lg:min-h-[124px] lg:rounded-[22px] lg:border-[3px] lg:border-ink lg:bg-ink lg:px-[22px] lg:py-5 lg:first:border-t-[3px]"
          >
            <p className="flex items-center gap-2 lg:gap-2.5">
              {limit.warn ? (
                <TriangleAlert aria-hidden="true" className={cn("size-[18px] shrink-0 lg:size-[22px]", limit.tone)} strokeWidth={2.6} />
              ) : (
                <Check aria-hidden="true" className="size-[18px] shrink-0 text-lime lg:size-[22px]" strokeWidth={2.6} />
              )}
              <span className="font-heading text-[17px] leading-[21px] font-extrabold lg:text-[22px] lg:leading-[26px]">{limit.title}</span>
            </p>
            <p className="mt-1 text-[13.5px] leading-[19px] font-medium text-[#b9becb] lg:mt-2.5 lg:text-[15px] lg:leading-[21px]">{limit.text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
