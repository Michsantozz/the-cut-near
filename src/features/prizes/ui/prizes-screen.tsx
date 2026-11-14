import { cn } from "cn";
import { Gift, Hourglass, Plus } from "lucide-react";
import Link from "next/link";

import { publicEnv } from "@/shared/config/public";
import { formatAmount, formatCount, formatUsd, formatUtcDate, formatUtcTime, relativeUtcDay } from "@/shared/ui/format";
import { Button } from "@/shared/ui/button";
import { WalletGatedLink } from "@/shared/wallet";

import type { Breakdown } from "../model/breakdown";
import type { Prizes } from "../server/load-prizes";
import { CollectCard } from "./collect-card";

// Prizes (Earnings.dc.html, DeskEarnings.dc.html): what is ready to collect, how it was made, past slices.

const cut0 = (value: bigint) => formatAmount(value, { maxFractionDigits: 0 });
const cut1 = (value: bigint) => formatAmount(value, { maxFractionDigits: 1 });
const cut2 = (value: bigint) => formatAmount(value, { maxFractionDigits: 2 });
const EXPLORER_TX: Record<string, string> = { testnet: "https://testnet.nearblocks.io/txns/", mainnet: "https://nearblocks.io/txns/" };

const STEP_BG = ["bg-orange", "bg-[#ffd84d]", "bg-lime", "bg-sky", "bg-pink"];

const RULES = [
  "Every $CUT buy or sell adds a 1% fee to the day’s prize.",
  "Every day at 18:00 UTC the lowest pile is cut. Half burns, half joins the prize.",
  "95% goes to savers in 9 equal slices, one per surviving robot. 5% to their creators.",
  "Every survivor gets the same slice. Small piles share it among fewer $CUT, so they pay more.",
];

function dayWord(now: Date, at: Date, capital = false): string {
  const yesterday = relativeUtcDay(new Date(now.getTime() - 86_400_000), at) === "today" ? "yesterday" : null;
  const day = relativeUtcDay(now, at) ?? yesterday;
  const word = day ?? formatUtcDate(at);
  return capital && day ? word[0].toUpperCase() + word.slice(1) : word;
}

function Steps({ b, names, now }: { b: Breakdown; names: Record<string, string>; now: Date }) {
  const cutName = b.cutRobotId ? (names[b.cutRobotId] ?? b.cutRobotId) : "The lowest robot";
  const robot = names[b.robotId] ?? b.robotId;
  const steps = [
    { text: `${cutName}’s pile, the lowest`, desk: `${cutName}’s pile, the lowest`, value: cut0(b.pile), sub: "Its NEAR account is deleted" },
    { text: "Half burned", desk: "Half burned", value: cut0(b.burned), sub: "Gone from supply for good" },
    { text: `Prize: half + ${cut0(b.fees)} in fees`, desk: "Prize: half + the day’s fees", value: cut0(b.prize), sub: `${cut0(b.pile - b.burned)} + ${cut0(b.fees)} in fees` },
    {
      text: `Slice per survivor: ${b.saversBps / 100}% ÷ ${formatCount(b.survivors)}`,
      desk: "One slice per survivor",
      value: cut1(b.slice),
      sub: `${b.saversBps / 100}% ÷ ${formatCount(b.survivors)} robots. ${(10_000 - b.saversBps) / 100}% (${cut0((b.prize * BigInt(10_000 - b.saversBps)) / 10_000n)}) to creators`,
    },
    { text: `${cut0(b.saved)} of ${robot}’s ${cut0(b.robotPile)}`, desk: `Your ${cut0(b.saved)} of ${cut0(b.robotPile)} saved`, value: `${cut2(b.share)} $CUT`, sub: `${robot}’s savers share its slice` },
  ];
  const title = `How your ${cut2(b.share)} was made`;
  const date = `${formatUtcDate(b.at)}${b.cutRobotId ? ` · ${cutName} was cut` : ""}`;
  return (
    <section aria-labelledby="made-title" className="rounded-3xl border-2 border-ink bg-paper px-4 pt-3.5 pb-3 shadow-hard lg:px-6 lg:pt-5 lg:pb-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="made-title" className="font-heading text-lg font-extrabold lg:text-[22px]">
          {title}
        </h2>
        <span className="text-[13px] font-semibold text-ink-3">
          <span className="lg:hidden">{formatUtcDate(b.at)}</span>
          <span className="hidden lg:inline">{date}</span>
        </span>
      </div>
      <ol className="mt-2 lg:hidden">
        {steps.map((step, i) => (
          <li key={i} className={cn("flex h-[42px] items-center gap-3 text-sm", i > 0 && "border-t-[1.5px] border-canvas")}>
            <span className={cn("flex size-[22px] shrink-0 items-center justify-center rounded-md border-2 border-ink text-xs font-extrabold", STEP_BG[i])}>{i + 1}</span>
            <span className="min-w-0 grow truncate">{step.text}</span>
            <span className="font-extrabold whitespace-nowrap">{step.value}</span>
          </li>
        ))}
      </ol>
      <ol className="mt-3 hidden grid-cols-5 gap-3 lg:grid">
        {steps.map((step, i) => (
          <li key={i} className="rounded-2xl border-2 border-ink px-3 pt-3 pb-3">
            <span className={cn("flex size-6 items-center justify-center rounded-md border-2 border-ink text-xs font-extrabold", STEP_BG[i])}>{i + 1}</span>
            <p className="mt-2 text-sm leading-[19px] text-ink-2">{step.desk}</p>
            <p className="mt-2 font-heading text-[19px] font-extrabold whitespace-nowrap">{step.value}</p>
            <p className="mt-1 text-xs leading-4 text-ink-3">{step.sub}</p>
          </li>
        ))}
      </ol>
      <p className="mt-2 border-t-[1.5px] border-line pt-2 text-[12.5px] leading-[18px] text-ink-3 lg:mt-3 lg:pt-3 lg:text-[13px]">
        Only what was paid, never a forecast. Every survivor gets the same slice, so small piles pay more per $CUT.
      </p>
      <span className="sr-only">{dayWord(now, b.at)}</span>
    </section>
  );
}

type CutRow = { key: string; title: string; amount: string; sub: string; badge: string; badgeTone: "ready" | "next" | "done"; href?: string };

function YourCuts({ rows, className }: { rows: CutRow[]; className?: string }) {
  if (rows.length === 0) return null;
  return (
    <section aria-labelledby="cuts-title" className={className}>
      <div className="flex items-baseline justify-between px-0.5 lg:px-0">
        <h2 id="cuts-title" className="font-heading text-lg font-extrabold lg:text-[19px]">
          Your cuts
        </h2>
        <span className="text-[12.5px] font-semibold text-ink-3 lg:hidden">a cut every day, 18:00 UTC</span>
      </div>
      <ul className="mt-2 grid grid-cols-2 gap-2.5 lg:mt-1 lg:grid-cols-1 lg:gap-0">
        {rows.map((row, i) => (
          <li
            key={row.key}
            className={cn(
              "rounded-[14px] border-2 border-ink bg-paper px-2.5 py-2 lg:flex lg:items-start lg:justify-between lg:rounded-none lg:border-0 lg:px-0 lg:py-2.5",
              i > 0 && "lg:border-t-[1.5px] lg:border-line",
            )}
          >
            <div className="flex items-start justify-between gap-1 lg:block">
              <p className="text-[13px] font-extrabold lg:text-[15px]">{row.title}</p>
              <Badge row={row} className="lg:hidden" />
              <p className="hidden text-[13px] text-ink-3 lg:block">{row.sub}</p>
            </div>
            <div className="lg:text-right">
              <p className="font-heading text-[17px] font-extrabold lg:order-first lg:font-sans lg:text-[15px]">{row.amount}</p>
              <p className="text-xs text-ink-3 lg:hidden">{row.sub}</p>
              <Badge row={row} className="hidden lg:inline-flex" />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Badge({ row, className }: { row: CutRow; className?: string }) {
  const tone = row.badgeTone === "ready" ? "bg-lime" : row.badgeTone === "done" ? "bg-lime-soft" : "bg-paper";
  const body = <span className={cn("inline-flex h-5 items-center rounded-full border-2 border-ink px-2 text-[11px] font-extrabold whitespace-nowrap", tone, className)}>{row.badge}</span>;
  return row.href ? (
    <a href={row.href} target="_blank" rel="noopener noreferrer">
      {body}
    </a>
  ) : (
    body
  );
}

function PrizesSoFar({ data, sub }: { data: Prizes; sub: string }) {
  return (
    <section className="relative rounded-3xl border-2 border-ink bg-blue px-[18px] pt-3.5 pb-3.5 text-paper shadow-hard lg:px-5">
      <p className="text-[13px] font-bold">Prizes so far</p>
      <p className="font-heading text-[40px] leading-[44px] font-extrabold tracking-[-1px]">{cut2(data.total)} $CUT</p>
      <p className="text-[13px] font-bold">{sub}</p>
      <span aria-hidden="true" className="absolute top-3.5 right-4 flex size-[46px] items-center justify-center rounded-[14px] border-2 border-ink bg-lime text-ink">
        <Gift className="size-[22px]" strokeWidth={2.6} />
      </span>
    </section>
  );
}

function HowPrizesWork() {
  return (
    <section aria-labelledby="how-title" className="rounded-3xl border-2 border-ink bg-paper px-[18px] pt-4 pb-4">
      <h2 id="how-title" className="font-heading text-[19px] font-extrabold">
        How prizes work
      </h2>
      <ol className="mt-2 flex flex-col gap-2.5">
        {RULES.map((rule, i) => (
          <li key={i} className="flex gap-2.5 text-sm leading-[19px]">
            <span className="flex size-[22px] shrink-0 items-center justify-center rounded-md border-2 border-ink text-xs font-extrabold">{i + 1}</span>
            {rule}
          </li>
        ))}
      </ol>
      <Link href="/inside" className="mt-3 inline-block text-sm font-bold text-blue underline">
        How the cut works
      </Link>
    </section>
  );
}

/** Nothing to collect: saved and waiting for the cut (`empty`), or nothing saved (`locked`). */
function Waiting({ data, now }: { data: Prizes; now: Date }) {
  const saved = data.saved.total > 0n;
  const at = data.nextCut.at;
  const when = `${dayWord(now, at, true)} at ${formatUtcTime(at)} UTC`;
  const steps = saved
    ? [
        `${when} the lowest pile is cut.${data.nextCut.lowestName ? ` ${data.nextCut.lowestName} is lowest now.` : ""}`,
        "Half its pile burns. The other half plus the day’s fees is the prize, in 9 equal slices.",
        `If ${data.saved.robotName} survives, you share its slice with its savers. If it is cut, half your save burns.`,
      ]
    : [
        "Save $CUT on a robot. It stays locked until the next cut.",
        "Every day at 18:00 UTC the lowest pile is cut: half burns, half plus the day’s 1% fees is the prize.",
        "95% goes to savers in 9 equal slices, one per surviving robot; small piles pay more per $CUT. 5% goes to creators.",
      ];
  return (
    <section className="rounded-3xl border-2 border-ink bg-paper px-[18px] pt-4 pb-[18px] shadow-hard-lg">
      <div className="flex items-center gap-2.5">
        <span aria-hidden="true" className={cn("flex size-8 items-center justify-center rounded-lg border-2 border-ink", saved ? "bg-sky" : "bg-lime")}>
          {saved ? <Hourglass className="size-4" strokeWidth={2.6} /> : <Gift className="size-4" strokeWidth={2.6} />}
        </span>
        <h2 className="font-heading text-xl font-extrabold">{saved ? "Nothing to collect yet" : "Prizes are for savers"}</h2>
      </div>
      <p className="mt-2 inline-flex rounded-full border-2 border-ink bg-lime px-2.5 py-0.5 text-xs font-extrabold">
        {saved ? `You saved ${cut0(data.saved.total)} on ${data.saved.robotName}` : `Paid every day, after the ${formatUtcTime(at)} UTC cut`}
      </p>
      <ol className="mt-3 flex flex-col gap-2.5">
        {steps.map((step, i) => (
          <li key={i} className="flex gap-2.5 text-[15px] leading-[21px]">
            <span className="flex size-[22px] shrink-0 items-center justify-center rounded-md border-2 border-ink text-xs font-extrabold">{i + 1}</span>
            {step}
          </li>
        ))}
      </ol>
      {saved ? (
        <Button asChild variant="outline" className="mt-4 h-11 rounded-xl px-4 text-[15px]">
          <Link href="/inside">How the cut works</Link>
        </Button>
      ) : (
        <Button asChild variant="primary" elevated className="mt-4 h-[52px] w-full rounded-2xl text-base">
          <WalletGatedLink href="/buy">
            <Plus aria-hidden="true" className="size-[18px]" strokeWidth={2.8} />
            Buy $CUT
          </WalletGatedLink>
        </Button>
      )}
    </section>
  );
}

export function PrizesScreen({ data }: { data: Prizes }) {
  const now = new Date(data.renderedAt);
  const b = data.breakdown;
  const robotName = b ? (data.names[b.robotId] ?? b.robotId) : null;
  const cutName = b?.cutRobotId ? (data.names[b.cutRobotId] ?? b.cutRobotId) : null;
  const nextDay = formatUtcDate(data.nextCut.at);
  const ready = data.claimable > 0n;

  const rows: CutRow[] = [];
  if (ready && b)
    rows.push({ key: "ready", title: `${dayWord(now, b.at, true)} · ${formatUtcDate(b.at)}`, amount: `${cut2(data.claimable)} $CUT`, sub: cutName ? `${cutName} was cut` : `Cut #${b.cutIndex}`, badge: "Ready", badgeTone: "ready" });
  for (const past of data.past.slice(0, 3))
    rows.push({ key: past.key, title: formatUtcDate(past.at), amount: `${cut2(past.amount)} $CUT`, sub: "Collected", badge: "In wallet", badgeTone: "done", href: past.href });
  if (data.keep || data.saved.total > 0n)
    rows.push({
      key: "next",
      title: `${dayWord(now, data.nextCut.at, true)} · ${nextDay}`,
      amount: "Next",
      sub: `Only if ${data.keep?.robotName ?? data.saved.robotName} survives`,
      badge: "Not yet",
      badgeTone: "next",
    });

  const soFarSub =
    data.total > 0n
      ? `${data.claimableUsdCents !== null && ready ? `${formatUsd(data.claimableUsdCents)}, ` : ""}from ${formatCount(data.cutsPaid)} ${data.cutsPaid === 1 ? "cut" : "cuts"}`
      : data.saved.total > 0n
        ? `First prize: ${dayWord(now, data.nextCut.at)}, ${formatUtcTime(data.nextCut.at)} UTC, after the cut`
        : "You hold no $CUT yet";

  const main = ready ? (
    <>
      <CollectCard
        amount={cut2(data.claimable)}
        usd={data.claimableUsdCents === null ? null : formatUsd(data.claimableUsdCents)}
        dateLabel={b ? formatUtcDate(b.at) : "now"}
        why={b && robotName ? `${robotName} survived. This is your share of its slice.` : "Your prizes from the cuts and your creator slices."}
        keep={data.keep ? { robotId: data.keep.robotId, robotName: data.keep.robotName, amount: cut0(data.keep.amount), nextDay } : null}
        registered={data.registered}
        explorerTxBase={EXPLORER_TX[publicEnv.network]}
      />
      {b && <Steps b={b} names={data.names} now={now} />}
    </>
  ) : (
    <Waiting data={data} now={now} />
  );

  return (
    <>
      <div className="mx-auto max-w-[640px] px-5 pb-6 lg:hidden">
        <h2 className="pt-4 font-heading text-[34px] leading-[38px] font-extrabold tracking-[-0.8px]">Prizes</h2>
        <p className="text-[15px] text-ink-3">{ready || data.saved.total > 0n ? "Your share of each day’s cut" : "How savers share each day’s cut"}</p>
        <div className="mt-3 flex flex-col gap-3">
          {!ready && <PrizesSoFar data={data} sub={soFarSub} />}
          {main}
          <YourCuts rows={rows} className="mt-1" />
        </div>
      </div>
      <div className="hidden gap-6 px-8 pt-1 pb-7 lg:flex">
        <div className="flex min-w-0 grow flex-col gap-4">{main}</div>
        <div className="flex w-[340px] shrink-0 flex-col gap-4">
          <PrizesSoFar data={data} sub={soFarSub} />
          {rows.length > 0 && (
            <div className="rounded-3xl border-2 border-ink bg-paper px-[18px] pt-3.5 pb-2">
              <YourCuts rows={rows} />
            </div>
          )}
          <HowPrizesWork />
        </div>
      </div>
    </>
  );
}

/** A visitor: how prizes work, and a way in. */
export function PrizesVisitor() {
  return (
    <div className="mx-auto max-w-[640px] px-5 pb-6 lg:max-w-none lg:px-8 lg:pt-1">
      <h2 className="pt-4 font-heading text-[34px] leading-[38px] font-extrabold tracking-[-0.8px] lg:hidden">Prizes</h2>
      <p className="text-[15px] text-ink-3 lg:hidden">How savers share each day’s cut</p>
      <div className="mt-3 flex flex-col gap-4 lg:mt-0 lg:flex-row lg:items-start lg:gap-6">
        <div className="lg:grow">
          <section className="rounded-3xl border-2 border-ink bg-paper px-[18px] pt-4 pb-[18px] shadow-hard-lg">
            <div className="flex items-center gap-2.5">
              <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-lg border-2 border-ink bg-lime">
                <Gift className="size-4" strokeWidth={2.6} />
              </span>
              <h2 className="font-heading text-xl font-extrabold">Prizes are for savers</h2>
            </div>
            <ol className="mt-3 flex flex-col gap-2.5">
              {RULES.slice(1).map((rule, i) => (
                <li key={i} className="flex gap-2.5 text-[15px] leading-[21px]">
                  <span className="flex size-[22px] shrink-0 items-center justify-center rounded-md border-2 border-ink text-xs font-extrabold">{i + 1}</span>
                  {rule}
                </li>
              ))}
            </ol>
            <Button asChild variant="primary" elevated className="mt-4 h-[52px] w-full rounded-2xl text-base lg:w-auto lg:px-7">
              <WalletGatedLink href="/buy">
                <Plus aria-hidden="true" className="size-[18px]" strokeWidth={2.8} />
                Buy $CUT
              </WalletGatedLink>
            </Button>
          </section>
        </div>
        <div className="lg:w-[340px] lg:shrink-0">
          <HowPrizesWork />
        </div>
      </div>
    </div>
  );
}
