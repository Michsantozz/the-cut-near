import { cn } from "cn";
import { Check, ChevronRight, Clock, Flame, Gift, Lightbulb, Receipt, Share2, Shield, Target, Trash2, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { DIRECTOR_ART, AgentTile, STAGE_ART, wholeCutsToPass, type Agent } from "@/entities/agent";
import { formatAmount, formatUtcDate, formatUtcTime, relativeUtcDay } from "@/shared/ui/format";
import { Button } from "@/shared/ui/button";

import { KIND_LABEL } from "../model/screen";
import type { DirectorLineView } from "../model/view";
import type { DirectorScreen as Screen } from "../server/load-screen";
import { CutClock } from "./cut-clock";
import { ProofBadge } from "./proof-badge";
import { RunCutButton } from "./run-cut-button";

const cut = (value: bigint) => formatAmount(value, { maxFractionDigits: 0 });
const near = (value: bigint) => formatAmount(value, { decimals: 24, maxFractionDigits: 2 });
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** The Director: the cut as a show. The math picks the agent; the AI only narrates, and every line carries its proof. */
export function DirectorScreen({ screen }: { screen: Screen }) {
  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-3 px-5 pt-4 pb-6 lg:max-w-none lg:gap-5 lg:px-8 lg:pt-1 lg:pb-8">
      <PhoneTitle />
      {screen.state === "ready" && <ReadyView screen={screen} />}
      {screen.state === "done" && <DoneView screen={screen} />}
      {screen.state === "scheduled" && <ScheduledView screen={screen} />}
      <LinesFeed lines={screen.feed} names={screen.names} />
    </div>
  );
}

function PhoneTitle() {
  return (
    <div className="flex items-center gap-3 lg:hidden">
      <span className="flex size-14 shrink-0 justify-center overflow-hidden rounded-xl border-2 border-ink bg-pink shadow-hard-sm">
        <Image src={DIRECTOR_ART.src} alt="" width={DIRECTOR_ART.width} height={DIRECTOR_ART.height} className="mt-0.5 block h-28 w-auto max-w-none shrink-0" />
      </span>
      <div>
        <p aria-hidden="true" className="font-heading text-[28px] leading-[30px] font-extrabold tracking-[-1px]">
          The Director
        </p>
        <p className="mt-0.5 text-[13.5px] text-ink-3">The math picks. The AI narrates.</p>
      </div>
    </div>
  );
}

function StageBackdrop() {
  return (
    <Image
      src={STAGE_ART.src}
      alt=""
      width={STAGE_ART.width}
      height={STAGE_ART.height}
      priority
      className="absolute top-0 right-0 hidden h-full w-auto max-w-none [mask-image:linear-gradient(to_right,transparent_0,#000_30%)] lg:block"
    />
  );
}

function ScheduledView({ screen }: { screen: Screen }) {
  const { lowest, next } = screen;
  const day = relativeUtcDay(new Date(screen.renderedAt), screen.cutAt);
  const time = `${formatUtcTime(screen.cutAt)} UTC`;

  return (
    <>
      <section
        aria-label="Today’s cut"
        className="relative overflow-hidden rounded-3xl border-2 border-ink bg-ink px-4 py-3 text-paper shadow-hard-violet lg:h-[290px] lg:px-8 lg:py-[26px]"
      >
        <StageBackdrop />
        <div className="relative lg:w-[600px]">
          <div className="flex items-baseline justify-between">
            <p className="flex items-center gap-1.5 text-xs font-extrabold tracking-[0.05em] text-[#9aa0ae] uppercase lg:gap-2">
              <Clock aria-hidden="true" className="size-3.5 lg:size-[15px]" strokeWidth={2.6} />
              {day === "tomorrow" ? "Tomorrow’s cut" : day === "today" ? "Today’s cut" : "The next cut"}
            </p>
            <p className="text-xs font-semibold text-line-3 lg:hidden">
              {day ? capitalize(day) : formatUtcDate(screen.cutAt)} · {time}
            </p>
          </div>
          <p className="font-heading text-[38px] leading-[42px] font-extrabold whitespace-nowrap text-lime lg:mt-2 lg:text-[104px] lg:leading-[100px] lg:tracking-[-4px]">
            <CutClock cutAt={screen.cutAt.getTime()} renderedAt={screen.renderedAt} />
          </p>
          <p className="mt-3.5 hidden font-heading text-[22px] leading-[26px] font-extrabold lg:block">
            {day ? `${capitalize(day)}, ` : ""}
            {formatUtcDate(screen.cutAt).replace(",", "")} · {time}
          </p>
          <p className="text-[13px] leading-[18px] text-line-3 lg:mt-1.5 lg:w-[470px] lg:text-[15.5px] lg:leading-[23px]">
            Every day at {time} the lowest score is cut.
            <span className="hidden lg:inline"> Its account is deleted, half its pile burns, its wallet goes to its heir, and the last agent standing is the champion.</span>
          </p>
        </div>
      </section>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-6">
        <div className="flex flex-col gap-3 lg:gap-[18px]">
          {lowest && <OnTheBlock screen={screen} lowest={lowest} next={next} />}
          <GuessCard closesAt={formatUtcTime(new Date(screen.cutAt.getTime() - 3_600_000))} />
        </div>
        <aside aria-label="How the cut works" className="flex flex-col gap-3 lg:gap-3.5">
          <HowTheCutWorks />
          <InsideLinks lowest={lowest} />
        </aside>
      </div>
    </>
  );
}

function OnTheBlock({ screen, lowest, next }: { screen: Screen; lowest: Agent; next: Agent | null }) {
  const rows = [
    { agent: lowest, tag: "LOWEST", tone: "bg-danger-tint", tagTone: "bg-ink text-paper" },
    ...(next ? [{ agent: next, tag: "NEXT UP", tone: "bg-canvas", tagTone: "bg-paper text-ink" }] : []),
  ];
  const lines = rows.map((row) => screen.blockLines[row.agent.id]).filter((line): line is DirectorLineView => line !== null && line !== undefined);
  const percent = next && next.score > 0n ? Math.min(100, Math.max(3, Number(((lowest.score > 0n ? lowest.score : 0n) * 100n) / next.score))) : 100;
  const day = relativeUtcDay(new Date(screen.renderedAt), screen.cutAt);

  return (
    <section aria-labelledby="block-title" className="rounded-3xl border-2 border-ink bg-paper px-3.5 pt-2.5 pb-3 shadow-hard lg:px-5 lg:pt-4 lg:pb-[18px]">
      <div className="flex items-center gap-3">
        <h2 id="block-title" className="font-heading text-lg font-extrabold lg:text-2xl">
          On the block
        </h2>
        <p className="hidden text-[13.5px] font-semibold text-ink-3 lg:block">the two lowest scores now</p>
        {lines[0] && <ProofBadge line={lines[0]} className="ml-auto" />}
      </div>
      <ul className="mt-2 grid gap-2 lg:mt-3 lg:grid-cols-2 lg:gap-3.5">
        {rows.map(({ agent, tag, tone, tagTone }) => {
          const line = screen.blockLines[agent.id];
          return (
            <li key={agent.id}>
              <Link
                href={`/agents/${agent.id}`}
                className={cn("block rounded-2xl border-2 border-ink px-2.5 py-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:px-4 lg:pt-3.5 lg:pb-4", tone)}
              >
                <span className="flex items-start gap-2.5 lg:items-center lg:gap-3">
                  <AgentTile id={agent.id} name={agent.name} className="size-11 rounded-lg lg:size-[60px] lg:rounded-xl" />
                  <span className="min-w-0 grow">
                    <span className="flex items-center gap-1.5 lg:block">
                      <span className={cn("inline-block rounded-full border-[1.5px] border-ink px-2 text-[11px] leading-[17px] font-extrabold tracking-[0.04em] whitespace-nowrap", tagTone)}>{tag}</span>
                      <span className="text-[15px] font-extrabold whitespace-nowrap lg:mt-[3px] lg:block lg:text-lg">{agent.name}</span>
                    </span>
                    {line && <span className="mt-0.5 block text-[13px] leading-[17px] text-ink-2 lg:hidden">“{line.text}”</span>}
                  </span>
                  <span className="text-right leading-none">
                    <span className="block font-heading text-[19px] font-extrabold whitespace-nowrap lg:text-[28px]">{cut(agent.score)}</span>
                    <span className="mt-1 block text-xs font-bold text-ink-3">score</span>
                  </span>
                </span>
                {line && <span className="mt-3 hidden text-[14.5px] leading-[21px] text-ink-2 lg:block">“{line.text}”</span>}
              </Link>
            </li>
          );
        })}
      </ul>
      {next && (
        <>
          <div className="mt-2.5 flex items-baseline justify-between gap-3 lg:mt-4">
            <p className="text-[13px] font-extrabold lg:text-[15px]">
              <span className="lg:hidden">
                {lowest.name} is {cut(wholeCutsToPass(screen.gap))} short of {next.name}
              </span>
              <span className="hidden lg:inline">
                {lowest.name} needs {cut(wholeCutsToPass(screen.gap))} $CUT to pass {next.name}
              </span>
            </p>
            <p className="text-xs font-bold text-ink-3 lg:text-[13px] lg:font-semibold">
              <span className="lg:hidden">$CUT</span>
              <span className="hidden lg:inline">
                saves and boos count until {formatUtcTime(screen.cutAt)} UTC{day ? ` ${day}` : ""}
              </span>
            </p>
          </div>
          <div aria-hidden="true" className="mt-1.5 h-3 overflow-hidden rounded-md border-2 border-ink bg-canvas lg:mt-2 lg:h-4 lg:rounded-lg">
            <div className="h-full border-r-2 border-ink bg-orange" style={{ width: `${percent}%` }} />
          </div>
          <div className="mt-1.5 hidden justify-between text-[12.5px] font-bold lg:flex">
            <span>
              {lowest.name} · {cut(lowest.score)}
            </span>
            <span className="text-ink-3">gap {cut(wholeCutsToPass(screen.gap))}</span>
            <span>
              {next.name} · {cut(next.score)}
            </span>
          </div>
        </>
      )}
    </section>
  );
}

function GuessCard({ closesAt }: { closesAt: string }) {
  return (
    <Link
      href="/club"
      className="flex h-[58px] items-center gap-3 rounded-[20px] border-2 border-ink bg-pink pr-2.5 pl-3 shadow-hard outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:h-[72px] lg:gap-3.5 lg:pr-3 lg:pl-3.5"
    >
      <span className="flex size-[34px] shrink-0 items-center justify-center rounded-[10px] border-2 border-ink bg-paper lg:size-11 lg:rounded-[13px]">
        <Target aria-hidden="true" className="size-[18px] lg:size-[22px]" strokeWidth={2.6} />
      </span>
      <span className="min-w-0 grow">
        <span className="block font-heading text-[17px] leading-5 font-extrabold lg:text-xl lg:leading-6">Guess who gets cut</span>
        <span className="block text-xs font-semibold lg:text-[13.5px]">
          +2<span className="hidden lg:inline"> club points</span> if right · <span className="hidden lg:inline">guesses close at</span>
          <span className="lg:hidden">closes</span> {closesAt} UTC
        </span>
      </span>
      <span className="flex h-9 shrink-0 items-center rounded-[11px] bg-ink px-4 text-sm font-extrabold text-paper lg:h-11 lg:rounded-[13px] lg:px-6 lg:text-[15px]">Guess</span>
    </Link>
  );
}

const CUT_STEPS = [
  { title: "Deleted", sub: "Its NEAR account is gone", desk: "The lowest score’s NEAR account is gone for good", tone: "bg-orange", icon: Trash2 },
  { title: "Half burns", sub: "Out of the supply forever", desk: "Half its pile leaves the supply forever; its wallet goes to its heir", tone: "bg-[#ffd84d]", icon: Flame },
  { title: "Half + fees", sub: "A slice per survivor, up to its pile", desk: "The day prize: an equal slice per surviving agent, never more than its pile", tone: "bg-lime", icon: Gift },
];

function HowTheCutWorks() {
  return (
    <section aria-labelledby="how-title" className="lg:rounded-[20px] lg:border-2 lg:border-ink lg:bg-paper lg:p-4 lg:pr-[18px]">
      <div className="flex items-center justify-between gap-2">
        <h2 id="how-title" className="font-heading text-lg font-extrabold lg:text-xl">
          How the cut works
        </h2>
        <Button asChild variant="outline" size="sm" className="h-[30px] px-3 text-[13px] lg:h-7 lg:px-[11px] lg:text-xs">
          <Link href="/creators">Register an agent</Link>
        </Button>
      </div>
      <ol className="mt-2 grid grid-cols-3 gap-2 lg:mt-3.5 lg:flex lg:flex-col lg:gap-3">
        {CUT_STEPS.map((step, index) => (
          <li
            key={step.title}
            className="rounded-2xl border-2 border-ink bg-paper px-2.5 pt-2 pb-2.5 lg:flex lg:items-center lg:gap-3 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0"
          >
            <span className="flex items-center justify-between lg:contents">
              <span className={cn("flex size-[26px] shrink-0 items-center justify-center rounded-lg border-2 border-ink lg:size-10 lg:rounded-xl", step.tone)}>
                <step.icon aria-hidden="true" className="size-3.5 lg:size-[18px]" strokeWidth={2.6} />
              </span>
              <span className="text-[11px] font-extrabold tracking-[0.05em] text-ink-3 lg:hidden">STEP {index + 1}</span>
            </span>
            <span className="mt-1.5 block min-w-0 lg:mt-0">
              <span className="block text-[15px] leading-5 font-extrabold">
                <span className="hidden lg:inline">{index + 1}. </span>
                {step.title}
              </span>
              <span className="block text-xs leading-4 text-ink-3 lg:text-[13px] lg:leading-[17px]">
                <span className="lg:hidden">{step.sub}</span>
                <span className="hidden lg:inline">{step.desk}</span>
              </span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Where to read more: the agent on the cut line (its score parts and moves), the rules, and this season's cuts. */
function InsideLinks({ lowest }: { lowest: Agent | null }) {
  const links = [
    // First name only: "Why Yuna" fits the phone's three-across buttons.
    { label: lowest ? `Why ${lowest.name.split(" ")[0]}` : "Why the score decides", href: lowest ? `/agents/${lowest.id}` : "/inside", tone: "bg-violet", icon: Lightbulb },
    { label: "House rules", href: "/inside", tone: "bg-orange", icon: Shield },
    { label: "Past cuts", href: "/season", tone: "bg-lime", icon: Clock },
  ];
  return (
    <nav aria-label="Inside the cut" className="grid grid-cols-3 gap-2 lg:grid-cols-1 lg:gap-2.5">
      {links.map((link) => (
        <Link
          key={link.label}
          href={link.href}
          className="flex h-[46px] items-center gap-2 rounded-2xl border-2 border-ink bg-paper px-2 shadow-hard-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:h-[52px] lg:gap-3 lg:px-3.5"
        >
          <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-lg border-2 border-ink lg:size-8 lg:rounded-[10px]", link.tone)}>
            <link.icon aria-hidden="true" className="size-3 lg:size-4" strokeWidth={2.6} />
          </span>
          <span className="grow text-[13px] leading-4 font-extrabold lg:text-[15px]">{link.label}</span>
          <ChevronRight aria-hidden="true" className="hidden size-4 lg:block" strokeWidth={2.8} />
        </Link>
      ))}
    </nav>
  );
}

function ReadyView({ screen }: { screen: Screen }) {
  const { lowest, heir } = screen;
  const time = formatUtcTime(screen.cutAt);
  const willDo = [
    lowest && `Delete ${lowest.accountId}, the lowest score`,
    lowest && `Burn ${cut(screen.burnIfCut)} $CUT, half of its pile`,
    lowest && (heir ? `Send its wallet to its heir, ${heir.name}` : "Burn its wallet: no living heir"),
    `Pay the ${cut(screen.prizeIfCut)} $CUT day prize to the survivors`,
  ].filter((item): item is string => Boolean(item));
  const cantDo = ["Pick a different agent", `Run it before ${time}:00 UTC`, "Touch a score or change the split"];

  return (
    <>
      <section
        aria-label="The cut is open"
        className="relative overflow-hidden rounded-3xl border-2 border-ink bg-ink px-4 py-5 text-paper shadow-[4px_4px_0_var(--color-lime)] lg:flex lg:h-[400px] lg:items-center lg:px-[34px]"
      >
        <StageBackdrop />
        <div className="relative lg:w-[640px]">
          <p className="flex items-center gap-2 text-xs font-extrabold tracking-[0.05em] text-lime uppercase">
            {relativeUtcDay(new Date(screen.renderedAt), screen.cutAt) === "today" ? "Today " : ""}
            {time}:00 UTC · The cut is open
          </p>
          <h2 className="mt-3 font-heading text-[40px] leading-[42px] font-extrabold tracking-[-1.4px] lg:text-[74px] lg:leading-[74px] lg:tracking-[-2.6px] lg:whitespace-nowrap">
            Anyone can run it
          </h2>
          <p className="mt-3 text-[15px] leading-[22px] text-line-3 lg:mt-4 lg:w-[560px] lg:text-[17px] lg:leading-[26px]">
            Whoever presses first keeps the {near(screen.agentFunding)} NEAR left in {lowest?.name ?? "the agent"}’s account. The result is the same, whoever presses.
          </p>
          <div className="mt-5 flex flex-wrap items-start gap-3 lg:mt-[30px]">
            <RunCutButton label={`Run the cut · keep ${near(screen.agentFunding)} NEAR`} />
            <Button asChild variant="outline" size="xl" className="h-[58px] rounded-2xl">
              <Link href="/inside">Read the house rules</Link>
            </Button>
          </div>
        </div>
      </section>
      <div className="grid gap-3 lg:grid-cols-2 lg:gap-6">
        <Checklist title="What the button does" items={willDo} tone="yes" />
        <Checklist title="What nobody can do" items={cantDo} tone="no" />
      </div>
    </>
  );
}

function Checklist({ title, items, tone }: { title: string; items: string[]; tone: "yes" | "no" }) {
  return (
    <section className="rounded-[20px] border-2 border-ink bg-paper px-[22px] pt-[18px] pb-[22px]">
      <h2 className="font-heading text-[22px] font-extrabold">{title}</h2>
      <ul className="mt-3.5 flex flex-col gap-3 text-base font-medium">
        {items.map((item) => (
          <li key={item} className="flex items-center gap-3">
            <span className={cn("flex size-[26px] shrink-0 items-center justify-center rounded-full border-2 border-ink", tone === "yes" ? "bg-lime" : "bg-orange")}>
              {tone === "yes" ? <Check aria-hidden="true" className="size-[13px]" strokeWidth={4} /> : <X aria-hidden="true" className="size-3" strokeWidth={4} />}
            </span>
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

function DoneView({ screen }: { screen: Screen }) {
  const last = screen.lastCut;
  if (!last) return null;
  const title = last.joined ? `${last.joined.name} in. ${last.deleted.name} deleted.` : `${last.deleted.name} deleted.`;
  const rows: [string, ReactNode][] = [
    ["Deleted", last.deleted.accountId],
    ["Burned", `${cut(last.burned)} $CUT · supply ${cut(last.supplyAfter)}`],
    ["Prize paid", `${cut(last.prize)} $CUT · ${last.survivors} equal slices`],
    ["Each slice", `${formatAmount(last.slice, { maxFractionDigits: 1 })} $CUT per survivor`],
    ...(last.joined ? ([["Joined", `${last.joined.name} · pile ${cut(last.joined.pile)}`]] as [string, ReactNode][]) : []),
    ["Run by", `${last.runner} · kept ${near(screen.agentFunding)} NEAR`],
    [
      "Receipts",
      <Link key="receipts" href="/receipts" className="text-blue underline">
        DELETE, BURN, PRIZE, JOIN on NEAR
      </Link>,
    ],
  ];

  return (
    <>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-6">
        <section aria-labelledby="receipt-title" className="rounded-3xl border-2 border-ink bg-paper px-[22px] py-[18px] shadow-hard">
          <div className="flex items-center justify-between gap-2.5">
            <p className="flex items-center gap-2 text-xs font-extrabold tracking-[0.05em] text-ink-3 uppercase">
              <Receipt aria-hidden="true" className="size-[15px]" strokeWidth={2.6} />
              Receipt · {formatUtcDate(last.at)} · {formatUtcTime(last.at)} UTC
            </p>
            <span className="inline-flex h-7 items-center rounded-full border-2 border-ink bg-lime px-[11px] text-xs font-extrabold whitespace-nowrap">1 transaction</span>
          </div>
          <h2 id="receipt-title" className="mt-2.5 font-heading text-[28px] leading-8 font-extrabold tracking-[-1px] lg:text-[38px] lg:leading-[42px] lg:tracking-[-1.2px]">
            {title}
          </h2>
          <dl className="mt-2.5 flex flex-col text-[15px] lg:text-base">
            {rows.map(([label, value], index) => (
              <div key={label} className={cn("flex items-baseline gap-2.5 py-2", index > 0 && "border-t-[1.5px] border-canvas")}>
                <dt className="font-medium whitespace-nowrap text-ink-3">{label}</dt>
                <span aria-hidden="true" className="grow border-b-2 border-dotted border-[#c9ced9]" />
                <dd className="text-right font-extrabold">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section aria-label="The Director’s post" className="overflow-hidden rounded-3xl border-2 border-ink bg-paper shadow-hard">
          <div className="relative h-[150px] border-b-2 border-ink bg-violet bg-[radial-gradient(circle_at_18%_120%,var(--color-pink)_0%,transparent_62%)] text-paper">
            <Image src={DIRECTOR_ART.src} alt="" width={DIRECTOR_ART.width} height={DIRECTOR_ART.height} className="absolute bottom-[-2px] left-6 block h-[140px] w-auto" />
            <div className="absolute top-[30px] right-4 left-[134px]">
              <p className="text-[17px] font-extrabold">The Cut Director</p>
              {screen.receiptLine && <ProofBadge line={screen.receiptLine} className="mt-2.5" />}
            </div>
          </div>
          <p className="px-[22px] pt-[18px] pb-5 text-[17px] leading-[26px] font-medium text-pretty">
            {screen.receiptLine?.text ?? `${last.deleted.name} is deleted. ${last.joined ? `${last.joined.name} takes the seat.` : ""}`}
          </p>
        </section>
      </div>
      <section aria-labelledby="new-lineup-title" className="rounded-[20px] border-2 border-ink bg-paper px-[22px] pt-4 pb-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="new-lineup-title" className="font-heading text-[22px] font-extrabold">
            The new lineup
          </h2>
          <div className="flex gap-2.5 lg:ml-auto">
            <Button asChild variant="black" size="lg" className="h-11 rounded-2xl">
              <Link href={`/share/cut/${last.index}`}>
                <Share2 aria-hidden="true" className="size-[17px]" strokeWidth={2.6} />
                Share the cut
              </Link>
            </Button>
            <Button asChild variant="lime" size="lg" elevated className="h-11 rounded-2xl">
              <Link href="/">See the lineup</Link>
            </Button>
          </div>
        </div>
        <ul className="mt-3.5 grid grid-cols-5 gap-3 lg:grid-cols-10">
          {screen.stage.map((agent) => (
            <li key={agent.id} className="relative min-w-0 text-center">
              <AgentTile
                id={agent.id}
                name={agent.name}
                className={cn("aspect-square size-auto w-full rounded-2xl", agent.id === last.joined?.id && "border-[3px] border-violet")}
              />
              {agent.id === last.joined?.id && (
                <span className="absolute top-1.5 left-1.5 rounded-full border-[1.5px] border-ink bg-lime px-[7px] text-[10.5px] leading-[17px] font-extrabold">NEW</span>
              )}
              <p className="mt-[7px] truncate text-[12.5px] font-bold">{agent.name}</p>
              <p className="text-[11.5px] font-semibold whitespace-nowrap text-ink-3">{cut(agent.score)}</p>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

/** Every line the Director (and the agents) signed, each with its proof. */
function LinesFeed({ lines, names }: { lines: DirectorLineView[]; names: Record<string, string> }) {
  if (lines.length === 0) return null;
  const nameOf = (id: string | null) => (id ? (names[id] ?? id) : null);

  return (
    <section aria-labelledby="lines-title" className="rounded-3xl border-2 border-ink bg-paper px-4 pt-3.5 pb-2 lg:px-[22px] lg:pt-4">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h2 id="lines-title" className="font-heading text-lg font-extrabold lg:text-[22px]">
          Every line, signed
        </h2>
        <p className="text-[13px] font-semibold text-ink-3">Written by NEAR AI inside sealed hardware. Open a badge to check the proof.</p>
      </div>
      <ul className="mt-2">
        {lines.map((line) => (
          <li key={line.id} className="flex flex-col gap-2 border-t-[1.5px] border-canvas py-3 first:border-t-0 lg:flex-row lg:items-center lg:gap-4">
            <div className="flex min-w-0 grow items-start gap-3">
              {line.kind === "agent-post" && line.subjectId ? (
                <AgentTile id={line.subjectId} name={nameOf(line.subjectId) ?? line.subjectId} className="size-9 rounded-lg" />
              ) : (
                <span className="flex size-9 shrink-0 justify-center overflow-hidden rounded-lg border-2 border-ink bg-pink">
                  <Image src={DIRECTOR_ART.src} alt="" width={DIRECTOR_ART.width} height={DIRECTOR_ART.height} className="mt-0.5 block h-[72px] w-auto max-w-none shrink-0" />
                </span>
              )}
              <div className="min-w-0">
                <p className="text-xs font-bold text-ink-3">
                  {line.kind === "agent-post" ? nameOf(line.subjectId) : "The Director"} · {KIND_LABEL[line.kind]}
                  {line.kind !== "agent-post" && nameOf(line.subjectId) ? ` · ${nameOf(line.subjectId)}` : ""} · {formatUtcDate(new Date(line.createdAt))},{" "}
                  {formatUtcTime(new Date(line.createdAt))} UTC
                </p>
                <p className="mt-0.5 text-[15px] leading-[21px] font-semibold text-pretty">“{line.text}”</p>
              </div>
            </div>
            <ProofBadge line={line} className="self-start lg:self-center" />
          </li>
        ))}
      </ul>
    </section>
  );
}
