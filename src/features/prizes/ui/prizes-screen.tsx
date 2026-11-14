import { cn } from "cn";
import { Gift, Hourglass, Plus } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { AgentTile } from "@/entities/agent";
import { publicEnv } from "@/shared/config/public";
import { formatAmount, formatCount, formatUsd, formatUtcDate, formatUtcTime, relativeUtcDay } from "@/shared/ui/format";
import { Button } from "@/shared/ui/button";
import { WalletGatedLink } from "@/shared/wallet";

import type { Breakdown } from "../model/breakdown";
import type { Pile, Prizes, PrizesPreview } from "../server/load-prizes";
import { CollectCard } from "./collect-card";

// Prizes (Earnings.dc.html, DeskEarnings.dc.html): what is ready to collect, how it was made, past slices.

const cut0 = (value: bigint) => formatAmount(value, { maxFractionDigits: 0 });
const cut1 = (value: bigint) => formatAmount(value, { maxFractionDigits: 1 });
const cut2 = (value: bigint) => formatAmount(value, { maxFractionDigits: 2 });
const EXPLORER_TX: Record<string, string> = { testnet: "https://testnet.nearblocks.io/txns/", mainnet: "https://nearblocks.io/txns/" };

const STEP_BG = ["bg-orange", "bg-[#ffd84d]", "bg-lime", "bg-sky", "bg-pink"];

const RULES = [
  "Every $CUT buy or sell pays a 1% fee: half to the day’s prize, half to the season pot.",
  "Every day at 18:00 UTC the lowest score is cut. Half its pile burns, half joins the prize.",
  "90% goes to savers, one equal slice per surviving agent. 5% to the agents’ wallets, 5% to creators.",
  "Every survivor gets the same slice. Small piles share it among fewer $CUT, so they pay more.",
];

function dayWord(now: Date, at: Date, capital = false): string {
  const yesterday = relativeUtcDay(new Date(now.getTime() - 86_400_000), at) === "today" ? "yesterday" : null;
  const day = relativeUtcDay(now, at) ?? yesterday;
  const word = day ?? formatUtcDate(at);
  return capital && day ? word[0].toUpperCase() + word.slice(1) : word;
}

function Steps({ b, names, now }: { b: Breakdown; names: Record<string, string>; now: Date }) {
  const cutName = b.cutAgentId ? (names[b.cutAgentId] ?? b.cutAgentId) : "The lowest agent";
  const agent = names[b.agentId] ?? b.agentId;
  const steps = [
    { text: `${cutName}’s pile, the lowest`, desk: `${cutName}’s pile, the lowest`, value: cut0(b.pile), sub: "Its NEAR account is deleted" },
    { text: "Half burned", desk: "Half burned", value: cut0(b.burned), sub: "Gone from supply for good" },
    { text: `Prize: half + ${cut0(b.fees)} in fees`, desk: "Prize: half + the day’s fees", value: cut0(b.prize), sub: `${cut0(b.pile - b.burned)} + ${cut0(b.fees)} in fees` },
    {
      text: `Slice per survivor: ${b.saversBps / 100}% ÷ ${formatCount(b.survivors)}`,
      desk: "One slice per survivor",
      value: cut1(b.slice),
      sub: `${b.saversBps / 100}% ÷ ${formatCount(b.survivors)} agents. ${(10_000 - b.saversBps) / 100}% (${cut0((b.prize * BigInt(10_000 - b.saversBps)) / 10_000n)}) to creators`,
    },
    { text: `${cut0(b.saved)} of ${agent}’s ${cut0(b.agentPile)}`, desk: `Your ${cut0(b.saved)} of ${cut0(b.agentPile)} saved`, value: `${cut2(b.share)} $CUT`, sub: `${agent}’s savers share its slice` },
  ];
  const title = `How your ${cut2(b.share)} was made`;
  const date = `${formatUtcDate(b.at)}${b.cutAgentId ? ` · ${cutName} was cut` : ""}`;
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
          <li key={i} className={cn("flex min-h-[42px] items-center gap-3 py-2 text-sm", i > 0 && "border-t-[1.5px] border-canvas")}>
            <span className={cn("flex size-[22px] shrink-0 items-center justify-center rounded-3xs border-2 border-ink text-xs font-extrabold", STEP_BG[i])}>{i + 1}</span>
            <span className="min-w-0 grow leading-snug">{step.text}</span>
            <span className="font-extrabold whitespace-nowrap">{step.value}</span>
          </li>
        ))}
      </ol>
      <ol className="mt-3 hidden grid-cols-5 gap-3 lg:grid">
        {steps.map((step, i) => (
          <li key={i} className="rounded-2xl border-2 border-ink px-3 pt-3 pb-3">
            <span className={cn("flex size-[26px] items-center justify-center rounded-2xs border-2 border-ink text-xs font-extrabold", STEP_BG[i])}>{i + 1}</span>
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

function PrizesSoFar({ total, sub }: { total: bigint; sub: string }) {
  return (
    <section className="relative rounded-3xl border-2 border-ink bg-blue px-4 py-3 text-paper shadow-hard lg:px-[18px] lg:py-4">
      <p className="text-[13px] font-semibold text-[#dce6ff]">Prizes so far</p>
      <p className="font-heading text-[38px] leading-[42px] font-extrabold lg:text-[40px] lg:leading-[44px]">{cut2(total)} $CUT</p>
      <p className="text-[13px] font-semibold text-[#dce6ff]">{sub}</p>
      <span aria-hidden="true" className="absolute top-3.5 right-3.5 flex size-[46px] items-center justify-center rounded-lg border-2 border-ink bg-lime text-ink lg:top-4 lg:right-4">
        <Gift className="size-[22px]" strokeWidth={2.6} />
      </span>
    </section>
  );
}

function HowPrizesWork() {
  return (
    <section aria-labelledby="how-title" className="rounded-2xl border-2 border-ink bg-paper px-4 pt-3.5 pb-3.5">
      <h2 id="how-title" className="font-heading text-lg font-extrabold">
        How prizes work
      </h2>
      <ol className="mt-2.5 flex flex-col gap-[9px]">
        {RULES.map((rule, i) => (
          <li key={i} className="flex items-start gap-2.5 text-[13.5px] leading-[19px]">
            <span className="flex size-[22px] shrink-0 items-center justify-center rounded-3xs border-2 border-ink bg-canvas text-[11px] font-extrabold">{i + 1}</span>
            {rule}
          </li>
        ))}
      </ol>
      <Link href="/inside" className="mt-3 inline-block text-[13.5px] font-bold text-blue underline">
        How the cut works
      </Link>
    </section>
  );
}

/** The stage's piles now, highest first: the lowest is cut next, the viewer's agent is marked. */
function PilesNow({ piles, mine, when }: { piles: Pile[]; mine: string | null; when: string }) {
  if (piles.length === 0) return null;
  const lowest = piles.at(-1)?.id;
  return (
    <section aria-labelledby="piles-title" className="rounded-3xl border-2 border-ink bg-paper px-[22px] pt-[18px] pb-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="piles-title" className="font-heading text-[22px] font-extrabold">
          The {formatCount(piles.length)} piles now
        </h2>
        <p className="text-[13px] font-semibold text-ink-3">$CUT saved · lowest is cut {when}</p>
      </div>
      <ol className="mt-3.5 grid gap-3" style={{ gridTemplateColumns: `repeat(${piles.length}, minmax(0, 1fr))` }}>
        {piles.map((agent) => {
          const low = agent.id === lowest;
          const yours = agent.id === mine;
          return (
            <li key={agent.id} className="relative min-w-0 text-center">
              <Link href={`/agents/${agent.id}`} className="block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                <AgentTile
                  id={agent.id}
                  name={agent.name}
                  className={cn("aspect-square size-auto w-full rounded-xl text-2xl", low && "border-dashed border-danger", yours && "border-3")}
                />
                {(low || yours) && (
                  <span
                    className={cn(
                      "absolute top-1.5 left-1.5 rounded-full px-[7px] text-[10.5px] leading-[17px] font-extrabold",
                      low ? "bg-ink text-paper" : "border-[1.5px] border-ink bg-lime",
                    )}
                  >
                    {low ? "LOWEST" : "YOURS"}
                  </span>
                )}
                <span className="mt-[7px] line-clamp-2 block text-[12.5px] leading-tight font-bold break-words">{agent.name}</span>
                <span className="block text-[11.5px] font-semibold whitespace-nowrap text-ink-3">{cut0(agent.pile)}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

type WaitingProps = { saved: Prizes["saved"] | null; nextCut: PrizesPreview["nextCut"]; now: Date };

/** Nothing to collect: saved and waiting for the cut (`empty`), or nothing saved (`locked`). */
function Waiting({ saved: save, nextCut, now }: WaitingProps) {
  const saved = save !== null && save.total > 0n;
  const at = nextCut.at;
  const when = `${dayWord(now, at, true)} at ${formatUtcTime(at)} UTC`;
  const steps = saved
    ? [
        `${when} the lowest score is cut.${nextCut.lowestName ? ` ${nextCut.lowestName} is lowest now.` : ""}`,
        "Half its pile burns. The other half plus the day’s fees is the prize: 90% to savers, one equal slice per survivor.",
        save.agents > 1
          ? "Each of your agents that survives shares its slice with its savers. A save on an agent that is cut is gone: half burns, half joins the prize."
          : `If ${save.agentName} survives, you share its slice with its savers. If it is cut, your save is gone: half burns, half joins the prize.`,
      ]
    : [
        "Save $CUT on an agent. It stays locked until the next cut.",
        `Every day at ${formatUtcTime(at)} UTC the lowest score is cut: half its pile burns, half plus the day’s fees is the prize.`,
        "90% goes to savers, one equal slice per surviving agent; small piles pay more per $CUT. 5% to the agents, 5% to creators.",
      ];
  const chip = saved
    ? `You saved ${cut0(save.total)} on ${save.agents > 1 ? `${save.agents} agents` : save.agentName}`
    : `Paid every day, after the ${formatUtcTime(at)} UTC cut`;
  return (
    <section className="rounded-3xl border-2 border-ink bg-paper px-4 py-3.5 shadow-hard lg:px-[22px] lg:py-5">
      <div className="flex flex-wrap items-center gap-2.5 lg:gap-3">
        <span aria-hidden="true" className={cn("flex size-[34px] items-center justify-center rounded-sm border-2 border-ink lg:size-10 lg:rounded-md", saved ? "bg-sky" : "bg-lime")}>
          {saved ? <Hourglass className="size-[18px] lg:size-5" strokeWidth={2.6} /> : <Gift className="size-[18px] lg:size-5" strokeWidth={2.6} />}
        </span>
        <h2 className="font-heading text-xl font-extrabold lg:text-[26px]">{saved ? "Nothing to collect yet" : "Prizes are for savers"}</h2>
        <p className="hidden rounded-full border-2 border-ink bg-lime px-3 py-1 text-[13px] font-bold whitespace-nowrap lg:ml-1.5 lg:block">{chip}</p>
      </div>
      <p className="mt-1.5 inline-block rounded-full border-2 border-ink bg-lime px-2.5 py-1 text-xs font-bold lg:hidden">{chip}</p>
      <ol className="mt-3 flex flex-col gap-2.5 lg:mt-4 lg:grid lg:grid-cols-3 lg:gap-3.5">
        {steps.map((step, i) => (
          <li key={i} className="flex items-start gap-2.5 text-sm leading-5 lg:rounded-xl lg:border-2 lg:border-ink lg:bg-[#f6f7fb] lg:px-3.5 lg:py-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-2xs border-2 border-ink bg-canvas text-xs font-extrabold lg:size-[26px] lg:bg-paper">{i + 1}</span>
            {step}
          </li>
        ))}
      </ol>
      {saved ? (
        <Button asChild variant="outline" className="mt-3.5 h-[42px] rounded-md px-3.5 text-sm font-bold lg:mt-4 lg:h-11 lg:rounded-[13px] lg:px-[18px] lg:font-extrabold">
          <Link href="/inside">How the cut works</Link>
        </Button>
      ) : (
        <Button asChild variant="primary" elevated className="mt-3.5 h-[50px] w-full rounded-xl text-[15px] font-bold lg:mt-4 lg:h-12 lg:w-auto lg:px-6 lg:font-extrabold">
          <WalletGatedLink href="/buy">
            <Plus aria-hidden="true" className="size-[18px]" strokeWidth={2.6} />
            Buy $CUT · from $10
          </WalletGatedLink>
        </Button>
      )}
    </section>
  );
}

/** Phone: title, the total, the main cards. Laptop: the main cards next to the total and how prizes work. */
function Layout({ sub, soFar, main, rows }: { sub: string; soFar: { total: bigint; sub: string; phone: boolean }; main: ReactNode; rows: CutRow[] }) {
  return (
    <>
      <div className="mx-auto max-w-[640px] px-5 pb-6 lg:hidden">
        <h2 className="pt-4 font-heading text-[32px] leading-9 font-extrabold tracking-[-1px]">Prizes</h2>
        <p className="mt-0.5 text-sm text-ink-3">{sub}</p>
        <div className="mt-3 flex flex-col gap-3">
          {soFar.phone && <PrizesSoFar total={soFar.total} sub={soFar.sub} />}
          {main}
          <YourCuts rows={rows} className="mt-1" />
        </div>
      </div>
      <div className="hidden gap-6 px-8 pt-1 pb-7 lg:flex">
        <div className="flex min-w-0 grow flex-col gap-4">{main}</div>
        <div className="flex w-[340px] shrink-0 flex-col gap-4">
          <PrizesSoFar total={soFar.total} sub={soFar.sub} />
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

/** The page's subtitle, which the laptop header shows: a member's share, or how savers share for anyone else. */
export function prizesSub(data: Prizes | null): string {
  return data && (data.claimable > 0n || data.saved.total > 0n) ? "Your share of each day’s cut" : "How savers share each day’s cut";
}

export function PrizesScreen({ data }: { data: Prizes }) {
  const now = new Date(data.renderedAt);
  const b = data.breakdown;
  const agentName = b ? (data.names[b.agentId] ?? b.agentId) : null;
  const cutName = b?.cutAgentId ? (data.names[b.cutAgentId] ?? b.cutAgentId) : null;
  const nextDay = formatUtcDate(data.nextCut.at);
  const ready = data.claimable > 0n;

  const rows: CutRow[] = [];
  if (ready && b)
    rows.push({ key: "ready", title: `${dayWord(now, b.at, true)} · ${formatUtcDate(b.at)}`, amount: `${cut2(data.claimable)} $CUT`, sub: cutName ? `${cutName} was cut` : `Cut #${b.cutIndex}`, badge: "Ready", badgeTone: "ready" });
  for (const past of data.past.slice(0, 3))
    rows.push({ key: past.key, title: formatUtcDate(past.at), amount: `${cut2(past.amount)} $CUT`, sub: "Collected", badge: "In wallet", badgeTone: "done", href: past.href });
  // Nothing paid yet: the design shows no cuts list, only the waiting card.
  if ((ready || data.past.length > 0) && (data.keep || data.saved.total > 0n))
    rows.push({
      key: "next",
      title: `${dayWord(now, data.nextCut.at, true)} · ${nextDay}`,
      amount: "Next",
      sub: data.keep || data.saved.agents <= 1 ? `Only if ${data.keep?.agentName ?? data.saved.agentName} survives` : "Only from your agents that survive",
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
        why={b && agentName ? `${agentName} survived. This is your share of its slice.` : "Your prizes from the cuts and your creator slices."}
        keep={data.keep ? { agentId: data.keep.agentId, agentName: data.keep.agentName, amount: cut0(data.keep.amount), nextDay } : null}
        registered={data.registered}
        explorerTxBase={EXPLORER_TX[publicEnv.network]}
      />
      {b && <Steps b={b} names={data.names} now={now} />}
    </>
  ) : (
    <>
      <Waiting saved={data.saved} nextCut={data.nextCut} now={now} />
      <div className="hidden lg:block">
        <PilesNow piles={data.piles} mine={data.saved.total > 0n ? data.saved.agentId : null} when={pilesWhen(now, data.nextCut.at)} />
      </div>
    </>
  );

  return <Layout sub={prizesSub(data)} soFar={{ total: data.total, sub: soFarSub, phone: !ready }} main={main} rows={rows} />;
}

/** A visitor: how prizes work, the piles now, and a way in. */
export function PrizesVisitor({ data }: { data: PrizesPreview }) {
  const now = new Date(data.renderedAt);
  const main = (
    <>
      <Waiting saved={null} nextCut={data.nextCut} now={now} />
      <div className="hidden lg:block">
        <PilesNow piles={data.piles} mine={null} when={pilesWhen(now, data.nextCut.at)} />
      </div>
    </>
  );
  return <Layout sub={prizesSub(null)} soFar={{ total: 0n, sub: "You hold no $CUT yet", phone: true }} main={main} rows={[]} />;
}

function pilesWhen(now: Date, at: Date): string {
  const day = relativeUtcDay(now, at);
  return `${day ?? formatUtcDate(at)} at ${formatUtcTime(at)} UTC`;
}
