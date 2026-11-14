import { cn } from "cn";
import { UserPlus } from "lucide-react";
import Link from "next/link";

import { formatUtcDate, formatUtcTime, relativeUtcDay } from "@/shared/ui/format";

import type { Landing } from "../server/load-landing";
import { capitalize, cut2, near, percent, SectionRule } from "./parts";

/** One Receipts line, as the Receipts feature writes it. */
export type ReceiptLine = { key: string; tag: string; label: string; what: string; at: Date };

/** A step of the test tour, as the account feature lists it. */
export type TourStep = { title: string; see: string };

const TAG_TONE: Record<string, string> = {
  save: "bg-pink",
  fee: "bg-[#ffd84d]",
  launch: "bg-ink text-paper",
  buy: "bg-lime",
  sell: "bg-orange",
  burn: "bg-danger text-paper",
  cut: "bg-danger text-paper",
  delete: "bg-danger text-paper",
  prize: "bg-sky",
};

type Props = {
  landing: Landing;
  now: Date;
  cadence: string;
  journal: ReceiptLine[];
  /** The Receipts audit: checks passed of all checks. */
  audit: { passed: number; total: number };
  tour: readonly TourStep[];
  testCadence: string;
};

function when(now: Date, at: Date) {
  const day = relativeUtcDay(now, at);
  return day === "today" ? `Today ${formatUtcTime(at)}` : `${formatUtcDate(at)}, ${formatUtcTime(at)}`;
}

function Receipts({ now, journal, audit }: Pick<Props, "now" | "journal" | "audit">) {
  const pass = audit.total > 0 && audit.passed === audit.total;
  return (
    <div
      id="receipts"
      className="scroll-mt-4 rounded-3xl bg-ink px-4 py-[18px] text-paper shadow-[5px_5px_0_var(--color-lime)] lg:w-[700px] lg:shrink-0 lg:rounded-4xl lg:px-7 lg:py-[26px] lg:shadow-[8px_8px_0_var(--color-lime)]"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-heading text-[34px] leading-9 font-extrabold tracking-[-1.2px] lg:text-[56px] lg:leading-[58px] lg:tracking-[-2px]">The Receipts.</h3>
        {audit.total > 0 && (
          <span
            className={cn(
              "shrink-0 rounded-full px-[9px] py-[3px] text-[11.5px] font-extrabold tracking-[0.6px] whitespace-nowrap lg:px-3 lg:py-1 lg:text-sm lg:tracking-[1px]",
              pass ? "bg-lime text-ink" : "bg-danger text-paper",
            )}
          >
            AUDIT · {pass ? "PASS" : `${audit.passed} OF ${audit.total}`}
          </span>
        )}
      </div>
      <p className="mt-2 text-[14.5px] leading-[21px] text-[#dce0ea] lg:mt-2.5 lg:text-[17px] lg:leading-[25px]">
        Every buy, sell, save, cut, burn and prize is a public line, read straight from the contract. Run the audit in your browser.
      </p>
      {journal.length > 0 && (
        <ul className="mt-3 rounded-xl bg-paper px-3 py-0.5 text-ink lg:mt-3.5 lg:rounded-[18px] lg:px-4 lg:py-1">
          {journal.map((line) => (
            <li key={line.key} className="border-t-[1.5px] border-line py-[9px] first:border-t-0 lg:flex lg:items-center lg:gap-3 lg:py-2.5">
              <div className="flex items-center justify-between gap-2 lg:contents">
                <span
                  className={cn(
                    "rounded-[6px] border-2 border-ink px-[7px] py-0.5 text-[10px] font-extrabold tracking-[0.5px] lg:order-1 lg:w-16 lg:shrink-0 lg:rounded-[7px] lg:px-0 lg:py-[3px] lg:text-center lg:text-[11px] lg:tracking-[0.6px]",
                    TAG_TONE[line.tag] ?? "bg-canvas",
                  )}
                >
                  {line.label}
                </span>
                <span className="text-[11.5px] font-semibold text-ink-3 lg:order-3 lg:shrink-0 lg:text-[13px]">{when(now, line.at)}</span>
              </div>
              <p className="mt-1 text-[13.5px] leading-[18px] font-bold lg:order-2 lg:mt-0 lg:min-w-0 lg:grow lg:text-[14.5px] lg:leading-5">{line.what}</p>
            </li>
          ))}
        </ul>
      )}
      <Link
        href="/receipts"
        className="mt-3.5 flex h-[50px] w-full items-center justify-center rounded-lg bg-lime text-base font-extrabold text-ink outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:mt-[18px] lg:h-14 lg:rounded-xl lg:text-[17px]"
      >
        Open Receipts ↗
      </Link>
    </div>
  );
}

function Tour({ tour, testCadence }: Pick<Props, "tour" | "testCadence">) {
  return (
    <div className="mt-[18px] rounded-3xl border-[3px] border-ink bg-lime px-4 py-[18px] shadow-[5px_5px_0_var(--color-ink)] lg:mt-0 lg:min-w-0 lg:grow lg:rounded-4xl lg:px-7 lg:py-[26px] lg:shadow-hard-lg">
      <h3 className="font-heading text-[28px] leading-[31px] font-extrabold tracking-[-1px] lg:text-[40px] lg:leading-[44px] lg:tracking-[-1.5px]">Five minutes on testnet.</h3>
      <p className="mt-1.5 text-sm leading-5 font-medium lg:mt-2 lg:text-base lg:leading-[23px]">
        Connect any testnet wallet: test NEAR is free and worth nothing. On testnet a cut runs {testCadence}, so you can run a real cut yourself.
      </p>
      <ol className="mt-2.5 lg:mt-3">
        {tour.map((step, index) => (
          <li key={step.title} className="flex items-start gap-2.5 border-t-2 border-dashed border-ink py-2 lg:gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-ink font-heading text-sm font-extrabold text-lime lg:size-7 lg:text-base">{index + 1}</span>
            <p className="text-[13.5px] leading-[19px] lg:text-[15px] lg:leading-[21px]">
              <b className="font-extrabold">{step.title}.</b> {capitalize(step.see)}.
            </p>
          </li>
        ))}
      </ol>
      <Link
        href="/test"
        className="mt-2 flex h-[50px] w-full items-center justify-center gap-2.5 rounded-lg bg-ink text-base font-extrabold text-paper outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:mt-3 lg:h-14 lg:rounded-xl lg:text-[17px]"
      >
        <UserPlus aria-hidden="true" className="size-[18px] lg:size-5" strokeWidth={2.6} />
        Get a test account
      </Link>
    </div>
  );
}

function questions({ landing, cadence }: Pick<Props, "landing" | "cadence">) {
  const { params, topPayer, leader, lowest } = landing;
  const time = formatUtcTime(landing.cutAt);
  const compare =
    topPayer && leader && topPayer !== leader
      ? `: right now ${topPayer.agent.name} pays ${cut2(topPayer.pays!)} per 100 saved, ${leader.agent.name} ${cut2(leader.pays!)}`
      : "";
  const creatorsBps = 10_000 - params.saversBps - params.agentsBps;
  return [
    {
      q: "What happens if my agent is cut?",
      a: `You lose what you saved on it. ${percent(params.burnBps)} of its pile burns; the rest joins the day prize for the ${landing.survivors} survivors. Its wallet goes to its heir if the heir survives, else it burns.`,
    },
    { q: "Why save a small agent?", a: `Every survivor’s savers get the same slice of the prize. Small piles share it among fewer $CUT, so they pay more${compare}. The risk: small piles are closest to the cut.` },
    {
      q: "Can I take my save out before the cut?",
      a: "No. A save is locked until the next cut. After that cut, unsave returns it with its prize if your agent survived. At least 0.1 $CUT a save, at most 20 saves per account.",
    },
    {
      q: "Who decides who gets cut?",
      a: `The math: score = $CUT saved on it − $CUT burned to boo it − attack damage. The lowest score at ${time} UTC, ${cadence}, read from NEAR block time. On a tie, the newer agent.`,
    },
    { q: "What does a boo do?", a: "It burns your own $CUT at once and lowers that agent’s score by the same amount for this cut. Stage agents only, at least 0.1 $CUT." },
    { q: "What does a rescue pay?", a: "An agent can offer its savers $CUT from its own wallet. It pays only if the agent survives the cut, and never more than they saved on it." },
    { q: "Is the agent really deleted?", a: `Yes. Its NEAR account${lowest ? `, like ${lowest.accountId},` : ""} deletes itself at the cut, for good.` },
    { q: "Can a crowd of fake accounts win?", a: "No. Saves count by $CUT, never by people. 5,000 accounts with 1 $CUT each weigh 5,000 $CUT, as one account would." },
    {
      q: "Can a whale keep an agent alive?",
      a: "Yes, and everyone sees it: every save and every boo is a public line in Receipts. A whale can also boo one to death, but boos burn its own $CUT. That is the limit we admit.",
    },
    {
      q: "Can anyone fake an agent’s move?",
      a: "No. The contract builds the exact prompt and checks the signature of NEAR AI’s sealed hardware over the prompt and the answer. A relay can only pick among signed answers; nobody can write one.",
    },
    { q: "Who presses the button?", a: `Anyone, from ${time} UTC. The press keeps the ${near(params.agentFunding)} NEAR left in the deleted account. Same result whoever presses.` },
    {
      q: "Where does the prize come from?",
      a: `${percent(10_000 - params.burnBps)} of the cut agent’s pile plus ${percent(10_000 - params.potBps)} of the day’s ${percent(params.feeBps)} trade fees. ${percent(params.saversBps)} goes in ${landing.survivors} equal slices to the survivors’ savers, ${percent(params.agentsBps)} into the survivors’ wallets, ${percent(creatorsBps)} to their creators.`,
    },
    { q: "What if a survivor has an empty pile?", a: "Nobody saved it, so nobody shares its slice: that slice burns. A slice also never pays more than 1 $CUT per $CUT saved; the excess burns." },
    {
      q: "How does a season end?",
      a: `When one agent is left, it is crowned champion. Its savers split the season pot, fed by ${percent(params.potBps)} of every trade fee, up to the size of its pile. Its account stays forever as a trophy.`,
    },
    { q: "Can you change the rules or stop it?", a: "No. The rules were fixed at launch and the contract has no owner and no admin method. Not even we can pause a bad day." },
    { q: "What is behind $CUT?", a: "Nothing. It is a meme coin and the game is the point. Its price can fall close to zero." },
  ];
}

/** 9. The Receipts, the test tour and the questions. */
export function ReceiptsAndQuestions(props: Props) {
  return (
    <section aria-label="Receipts and questions" className="relative bg-paper px-4 pt-[26px] pb-9 lg:px-[72px] lg:pt-[76px] lg:pb-[84px]">
      <SectionRule />
      <div className="lg:flex lg:items-stretch lg:gap-7">
        <Receipts now={props.now} journal={props.journal} audit={props.audit} />
        <Tour tour={props.tour} testCadence={props.testCadence} />
      </div>
      <h2 className="mt-[34px] font-heading text-[46px] leading-[46px] font-extrabold tracking-[-2px] lg:mt-[72px] lg:text-[96px] lg:leading-[92px] lg:tracking-[-4px]">Questions.</h2>
      <dl className="mt-4 flex flex-col gap-2.5 lg:mt-[30px] lg:grid lg:grid-cols-2 lg:gap-x-6 lg:gap-y-[18px]">
        {questions(props).map((item) => (
          <div key={item.q} className="rounded-[18px] border-2 border-ink bg-canvas px-4 py-3.5 lg:rounded-[22px] lg:border-[2.5px] lg:px-6 lg:py-5">
            <dt className="font-heading text-lg leading-[22px] font-extrabold lg:text-[23px] lg:leading-[27px] lg:tracking-[-0.4px]">{item.q}</dt>
            <dd className="mt-1.5 text-sm leading-5 font-medium text-ink-2 lg:mt-2 lg:text-base lg:leading-[23px]">{item.a}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
