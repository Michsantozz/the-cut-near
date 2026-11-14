import { cn } from "cn";
import { Check, Clock, Scissors, TrendingUp, TriangleAlert, Users, Wallet, X, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { NEAR_DECIMALS } from "@/shared/lib/amount";
import { formatAmount, formatCount, formatDuration, formatUsd, formatUtcDate, formatUtcTime, relativeUtcDay } from "@/shared/ui/format";
import { ConnectButton } from "@/shared/wallet";

import { cutText, whenText, type CutReceipt, type ReceiptTag } from "../model/describe";
import { FILTER_LABELS, RECEIPT_FILTERS, receiptsHref } from "../model/filters";
import { percentText } from "../model/supply";
import type { Receipts, ReceiptRow } from "../server/load-receipts";
import { RerunAuditButton } from "./rerun-audit-button";

// The Receipts page (Receipts.dc.html, ReceiptsPhone.dc.html): the public log of every mint, burn, trade,
// save, cut and prize, with an audit against the contract. Colors outside the app tokens are the design's own.

const card = "rounded-[22px] border-[2.5px] border-ink bg-paper shadow-hard lg:rounded-[26px] lg:border-[3px] lg:shadow-hard-lg";

const TAG_STYLE: Record<ReceiptTag, string> = {
  launch: "bg-ink text-paper",
  buy: "bg-sky",
  sell: "bg-line-3",
  fee: "bg-[#ffd84d]",
  save: "bg-pink",
  unsave: "bg-paper",
  cut: "border-dashed bg-paper text-[#d2261e]",
  burn: "bg-danger text-paper",
  prize: "bg-lime",
  join: "bg-lime",
  delete: "bg-ink text-paper",
  claim: "bg-lime",
  other: "bg-canvas",
};

const cutWhole = (value: bigint) => formatAmount(value, { maxFractionDigits: 0 });

export function ReceiptsScreen({ data }: { data: Receipts }) {
  const now = new Date(data.renderedAt);
  return (
    <div className="mx-auto w-full max-w-[640px] px-4 pb-8 lg:max-w-none lg:px-8">
      <Hero data={data} />
      <StatCards data={data} now={now} />
      <SupplyCard data={data} />
      <div className="mt-[22px] flex flex-col gap-[22px] lg:mt-7 lg:flex-row lg:items-start lg:gap-7">
        <JournalCard data={data} now={now} />
        <div className="flex flex-col gap-[22px] lg:w-[432px] lg:shrink-0 lg:gap-7">
          <AuditCard data={data} />
          <ContractCard data={data} />
        </div>
      </div>
      <p className="mt-8 text-[13px] leading-[18px] text-ink-3">
        {data.live ? "" : "Sample data. Every agent, account and number here is fictional. "}A $CUT transfer between two wallets is not in the journal.
      </p>
    </div>
  );
}

function Hero({ data }: { data: Receipts }) {
  const at = new Date(data.renderedAt);
  return (
    <div className="pt-[22px] lg:flex lg:items-start lg:justify-between lg:gap-8 lg:pt-2">
      <div className="lg:max-w-[820px]">
        <SourceChip data={data} className="lg:hidden" />
        <h2 className="mt-3.5 font-heading text-[60px] leading-[58px] font-extrabold tracking-[-2.5px] lg:hidden">The Receipts.</h2>
        <p className="mt-2.5 text-base leading-[23px] font-medium lg:mt-0 lg:text-[21px] lg:leading-[30px]">
          Every buy, sell, save, cut, burn and prize since launch, from the contract’s public log on NEAR. Every entry links to its transaction.
        </p>
      </div>
      <div className="mt-2 lg:mt-1 lg:flex lg:shrink-0 lg:flex-col lg:items-end lg:gap-2.5">
        <SourceChip data={data} className="hidden lg:inline-flex" />
        <p className="text-[12.5px] leading-[17px] font-semibold text-ink-3 lg:text-[13.5px]">
          {data.latestBlock !== null && `Block ${formatCount(data.latestBlock)} · `}
          {formatCount(data.entries)} journal entries since launch{data.launchedAt && `, ${formatUtcDate(data.launchedAt).replace(",", "")}`}
          {!data.live && data.stats.usdCentsPerNear !== null && ` · Sample data, 1 NEAR = ${formatUsd(data.stats.usdCentsPerNear)}`}
        </p>
        <span className="sr-only">Read at {formatUtcTime(at)} UTC</span>
      </div>
    </div>
  );
}

function SourceChip({ data, className }: { data: Receipts; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-8 items-center gap-2 rounded-full border-2 border-ink bg-paper px-3 text-[12.5px] font-extrabold whitespace-nowrap lg:h-[38px] lg:border-[2.5px] lg:px-4 lg:text-sm",
        className,
      )}
    >
      <span aria-hidden="true" className="size-[9px] rounded-full bg-[#2fbf4a] shadow-[0_0_0_4px_rgb(47_191_74/0.25)] lg:size-2.5" />
      {data.live ? "LIVE" : "SAMPLE"} · read at {formatUtcTime(new Date(data.renderedAt))} UTC from {data.contractId}
    </span>
  );
}

type Stat = { label: string; value: string; sub: string; icon: LucideIcon; bg: string };

function StatCards({ data, now }: { data: Receipts; now: Date }) {
  const { stats } = data;
  const price =
    stats.usdCentsPerNear !== null
      ? formatUsd((stats.priceYoctoNear * stats.usdCentsPerNear * 2n + 10n ** 24n) / (2n * 10n ** 24n))
      : `${formatAmount(stats.priceYoctoNear, { decimals: NEAR_DECIMALS, maxFractionDigits: 3 })} NEAR`;
  const priceSub =
    stats.usdCentsPerNear !== null
      ? `${formatAmount(stats.priceYoctoNear, { decimals: NEAR_DECIMALS, maxFractionDigits: 3 })} NEAR · 1 NEAR = ${formatUsd(stats.usdCentsPerNear)}`
      : "In NEAR, from the pool";
  const day = relativeUtcDay(now, stats.cutAt);
  const lastCut = stats.lastCut;
  const items: Stat[] = [
    { label: "$CUT PRICE", value: price, sub: priceSub, icon: TrendingUp, bg: "bg-paper" },
    { label: "BUYERS", value: formatCount(stats.buyers), sub: data.launchedAt ? `Since ${formatUtcDate(data.launchedAt).replace(",", "")}` : "Since launch", icon: Users, bg: "bg-paper" },
    { label: "FEES SO FAR", value: cutWhole(stats.feesSoFar), sub: "$CUT · to the next prize", icon: Wallet, bg: "bg-[#ffd84d]" },
    {
      label: "ON THE BLOCK",
      value: stats.lowest?.name ?? "Nobody",
      sub: stats.lowest ? `Pile ${cutWhole(stats.lowest.pile)}${stats.gap > 0n ? ` · ${cutWhole(stats.gap)} short` : ""}` : "The stage is empty",
      icon: TriangleAlert,
      bg: "bg-[#ffc2e8]",
    },
    {
      label: "NEXT CUT",
      value: formatDuration(stats.cutAt.getTime() - data.renderedAt),
      sub: `${day === "today" ? "Today" : day === "tomorrow" ? "Tomorrow" : formatUtcDate(stats.cutAt)}, ${formatUtcTime(stats.cutAt)} UTC`,
      icon: Clock,
      bg: "bg-lime",
    },
    {
      label: "CUTS SO FAR",
      value: formatCount(stats.cuts),
      sub: lastCut?.agentName ? `Last: ${lastCut.agentName}, ${cutWhole(lastCut.burned)} burned` : "The first one is next",
      icon: Scissors,
      bg: "bg-pink",
    },
  ];
  return (
    <ul className="mt-[18px] grid grid-cols-2 gap-3 lg:mt-12 lg:grid-cols-3 lg:gap-4 min-[1700px]:grid-cols-6">
      {items.map(({ label, value, sub, icon: Icon, bg }) => (
        <li
          key={label}
          className={cn(
            "min-w-0 rounded-[18px] border-[2.5px] border-ink px-3 pt-[11px] pb-3 shadow-hard lg:rounded-[22px] lg:border-[3px] lg:px-[18px] lg:pt-4 lg:pb-[18px] lg:shadow-[6px_6px_0_var(--color-ink)]",
            bg,
          )}
        >
          <p className="flex items-center gap-[5px] text-[11px] font-extrabold tracking-[0.8px] whitespace-nowrap lg:gap-1.5 lg:text-[12.5px] lg:tracking-[1px]">
            <Icon aria-hidden="true" className="size-[13px] lg:size-[15px]" strokeWidth={2.8} />
            {label}
          </p>
          <p className="mt-1 truncate font-heading text-[27px] leading-8 font-extrabold tracking-[-0.8px] lg:mt-1.5 lg:text-4xl lg:leading-[42px] lg:tracking-[-1.2px]">{value}</p>
          <p className="mt-0.5 text-xs leading-4 font-semibold opacity-80 lg:mt-1 lg:text-[13px] lg:leading-[18px]">{sub}</p>
        </li>
      ))}
    </ul>
  );
}

function SupplyCard({ data }: { data: Receipts }) {
  const { supply } = data;
  const parts = [
    { label: "MINTED", value: cutWhole(supply.minted), sub: data.launchedAt ? `Once, ${formatUtcDate(data.launchedAt).replace(",", "")}, ${formatUtcTime(data.launchedAt)}` : "Once, at launch", dot: "bg-ink" },
    { label: "BURNED", value: cutWhole(supply.burned), sub: supply.burned > 0n ? "Gone for good, at the cuts" : "First burn at the next cut", dot: "bg-danger" },
    { label: "SAVED IN PILES", value: cutWhole(supply.saved), sub: "Locked till the cut", dot: "bg-lime" },
    { label: "FREE", value: cutWhole(supply.free), sub: "In wallets and the pool", dot: "bg-paper" },
  ];
  const savedWidth = Math.max(supply.savedPermille / 10, 0.5);
  return (
    <section aria-labelledby="supply-title" className={cn(card, "mt-[22px] p-4 lg:mt-12 lg:px-6 lg:pt-5 lg:pb-[22px]")}>
      <div className="lg:flex lg:items-baseline lg:justify-between">
        <h2 id="supply-title" className="font-heading text-2xl leading-7 font-extrabold tracking-[-0.8px] lg:text-[30px] lg:leading-9 lg:tracking-[-1px]">
          Where all {cutWhole(supply.minted)} $CUT are
        </h2>
        <p className="mt-0.5 text-[13px] font-semibold text-ink-3 lg:text-sm">Minted once at launch. Supply only drops, at a cut.</p>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-2.5 gap-y-3 lg:mt-3.5 lg:grid-cols-4 lg:gap-4">
        {parts.map((part) => (
          <div key={part.label} className="flex min-w-0 items-start gap-2 lg:items-center lg:gap-3">
            <span aria-hidden="true" className={cn("mt-0.5 size-3.5 shrink-0 rounded-[5px] border-2 border-ink lg:mt-0 lg:size-[18px] lg:rounded-md", part.dot)} />
            <div className="min-w-0">
              <dt className="text-[10.5px] font-extrabold tracking-[0.7px] whitespace-nowrap text-ink-3 lg:text-[12.5px] lg:tracking-[1px]">{part.label}</dt>
              <dd className="font-heading text-[22px] leading-[26px] font-extrabold whitespace-nowrap lg:text-[32px] lg:leading-9 lg:tracking-[-1px]">{part.value}</dd>
              <dd className="text-[11.5px] leading-[15px] font-semibold text-ink-3 lg:text-[13px] lg:leading-[18px]">{part.sub}</dd>
            </div>
          </div>
        ))}
      </dl>
      <div className="mt-3.5 flex h-[26px] overflow-hidden rounded-[10px] border-[2.5px] border-ink lg:mt-4 lg:h-[30px] lg:rounded-xl lg:border-[3px]">
        <div
          className="flex items-center justify-center border-r-[2.5px] border-ink bg-lime text-xs font-extrabold lg:border-r-[3px]"
          style={{ width: `${savedWidth}%` }}
        >
          <span className="hidden lg:inline">{percentText(supply.savedPermille)}</span>
        </div>
        <div className="flex grow items-center bg-[repeating-linear-gradient(135deg,var(--color-paper)_0_8px,var(--color-canvas)_8px_16px)] pl-2 text-[11px] font-extrabold whitespace-nowrap text-ink-3 lg:pl-3 lg:text-xs">
          <span className="lg:hidden">{percentText(supply.savedPermille)} saved · </span>
          {percentText(supply.freePermille)} free · {cutWhole(supply.burned)} burned
        </div>
      </div>
    </section>
  );
}

function JournalCard({ data, now }: { data: Receipts; now: Date }) {
  const { filter } = data;
  return (
    <section aria-labelledby="journal-title" className={cn(card, "min-w-0 px-4 pt-4 pb-1.5 lg:flex-1 lg:px-6 lg:pt-[22px] lg:pb-2.5")}>
      <div className="lg:flex lg:items-center lg:justify-between">
        <h2 id="journal-title" className="font-heading text-[26px] leading-[30px] font-extrabold tracking-[-0.8px] lg:text-[30px] lg:tracking-[-1px]">
          The journal
        </h2>
        <p className="mt-0.5 text-[13px] font-semibold text-ink-3 lg:text-[13.5px]">Newest first · every entry links to NEAR</p>
      </div>
      <nav aria-label="Filter the journal" className="-mr-4 mt-3 flex gap-1.5 overflow-x-auto pb-1 lg:mr-0 lg:mt-3.5 lg:flex-wrap lg:gap-2">
        {RECEIPT_FILTERS.map((id) => {
          const on = id === filter;
          return (
            <Link
              key={id}
              href={receiptsHref(id)}
              aria-current={on ? "page" : undefined}
              scroll={false}
              className={cn(
                "inline-flex h-8 shrink-0 items-center rounded-full border-2 border-ink px-3 text-[13.5px] font-bold outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:h-[34px] lg:px-3.5 lg:text-sm",
                on ? "bg-ink text-paper" : "bg-paper hover:bg-canvas",
              )}
            >
              {FILTER_LABELS[id]}
            </Link>
          );
        })}
      </nav>
      {data.needsViewer ? (
        <div className="mt-3 border-t-[1.5px] border-line py-6 text-center">
          <p className="text-[14.5px] font-semibold">Connect a wallet to see the entries about your account.</p>
          <ConnectButton size="lg" className="mt-3">
            Connect
          </ConnectButton>
        </div>
      ) : (
        <ol className="mt-2.5 lg:mt-3">
          {data.pending && <PendingRow pending={data.pending} renderedAt={data.renderedAt} now={now} />}
          {data.rows.map((row) => (
            <JournalRow key={row.key} row={row} now={now} />
          ))}
          {data.rows.length === 0 && !data.pending && <li className="border-t-[1.5px] border-line py-6 text-center text-[14.5px] text-ink-3">No entries here yet.</li>}
        </ol>
      )}
      {(data.next || !data.isFirstPage) && (
        <div className="flex items-center justify-between gap-3 border-t-[1.5px] border-line py-3 text-[13.5px] font-bold">
          {!data.isFirstPage ? (
            <Link href={receiptsHref(filter)} className="underline underline-offset-4">
              Newest
            </Link>
          ) : (
            <span />
          )}
          {data.next && (
            <Link href={receiptsHref(filter, data.next)} className="underline underline-offset-4">
              Older entries
            </Link>
          )}
        </div>
      )}
    </section>
  );
}

function Tag({ tag, label }: { tag: ReceiptTag; label: string }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-[7px] border-2 border-ink px-2 py-[3px] text-center text-[10.5px] font-extrabold tracking-[0.5px] whitespace-nowrap lg:w-[76px] lg:rounded-lg lg:px-0 lg:py-1 lg:text-[11px] lg:tracking-[0.6px]",
        TAG_STYLE[tag],
      )}
    >
      {label}
    </span>
  );
}

function JournalRow({ row, now }: { row: ReceiptRow; now: Date }) {
  return (
    <li className="border-t-[1.5px] border-line py-[11px] lg:flex lg:min-h-14 lg:items-center lg:gap-3.5 lg:py-[7px]">
      <div className="flex items-center gap-2 lg:contents">
        <Tag tag={row.tag} label={row.label} />
        <time dateTime={row.at.toISOString()} className="min-w-0 grow text-[12.5px] font-semibold whitespace-nowrap text-ink-3 lg:order-0 lg:w-[116px] lg:grow-0 lg:text-[13px] lg:leading-[17px] lg:whitespace-normal">
          {whenText(row.at, now)}
        </time>
        <a
          href={row.href}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-[12.5px] font-bold underline underline-offset-2 lg:order-last lg:text-[13px]"
          aria-label={`See this ${row.label.toLowerCase()} on NEAR`}
        >
          NEAR ↗
        </a>
      </div>
      <div className="mt-1.5 min-w-0 lg:mt-0 lg:grow">
        <p className="text-[14.5px] leading-5 font-bold">{row.what}</p>
        <p className="mt-px text-[13px] leading-[18px] text-ink-3 lg:mt-0 lg:text-[14.5px] lg:leading-5">{row.detail}</p>
        {row.cut && <CutReceiptGrid cut={row.cut} />}
      </div>
    </li>
  );
}

/** The cut's receipt, as `get_cut` keeps it. */
function CutReceiptGrid({ cut }: { cut: CutReceipt }) {
  const cells = [
    { label: "Cut", value: `#${cut.index}` },
    { label: "Pile", value: cutText(cut.pile) },
    { label: "Burned", value: cutText(cut.burned) },
    { label: "Prize", value: cutText(cut.prize) },
    { label: "Slice", value: cutText(cut.slice) },
    { label: "Creator slice", value: cutText(cut.creatorSlice) },
  ];
  return (
    <div className="mt-2 rounded-xl border-2 border-dashed border-ink bg-canvas px-3 py-2.5">
      <dl className="grid grid-cols-3 gap-x-3 gap-y-1.5">
        {cells.map((cell) => (
          <div key={cell.label} className="min-w-0">
            <dt className="text-[10.5px] font-extrabold tracking-[0.5px] text-ink-3 uppercase">{cell.label}</dt>
            <dd className="text-[13.5px] font-extrabold whitespace-nowrap">{cell.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-1.5 text-[12.5px] leading-[17px] text-ink-3">
        {cut.agentAccountId ? `${cut.agentAccountId} deleted · ` : ""}run by <b className="font-bold text-ink">{cut.runner}</b>, who keeps 0.5 NEAR
      </p>
    </div>
  );
}

function PendingRow({ pending, renderedAt, now }: { pending: NonNullable<Receipts["pending"]>; renderedAt: number; now: Date }) {
  const day = relativeUtcDay(now, pending.at);
  const when = `Next · ${day === "today" ? "Today" : day === "tomorrow" ? "Tomorrow" : formatUtcDate(pending.at)} ${formatUtcTime(pending.at)} UTC`;
  return (
    <li className="border-t-[1.5px] border-line py-[11px] lg:flex lg:min-h-14 lg:items-center lg:gap-3.5 lg:py-[7px]">
      <div className="flex items-center gap-2 lg:contents">
        <Tag tag="cut" label="CUT" />
        <span className="min-w-0 grow text-[12.5px] font-semibold text-ink-3 lg:w-[116px] lg:grow-0 lg:text-[13px] lg:leading-[17px]">{when}</span>
        <span className="shrink-0 text-[12.5px] font-bold underline underline-offset-2 lg:order-last lg:text-[13px]">In {formatDuration(pending.at.getTime() - renderedAt)}</span>
      </div>
      <div className="mt-1.5 min-w-0 lg:mt-0 lg:grow">
        <p className="text-[14.5px] leading-5 font-bold">{pending.index === 1 ? "First cut" : `Cut #${pending.index}`}: the lowest pile is cut</p>
        <p className="mt-px text-[13px] leading-[18px] text-ink-3 lg:mt-0 lg:text-[14.5px] lg:leading-5">
          {pending.lowest ? `Right now ${pending.lowest.name}, ${cutWhole(pending.lowest.pile)} $CUT. ` : ""}Half burns; half plus the day’s fees: equal slices, one per survivor.
        </p>
      </div>
    </li>
  );
}

function AuditCard({ data }: { data: Receipts }) {
  const { checks, ms } = data.audit;
  const passed = checks.filter((check) => check.pass).length;
  const all = passed === checks.length;
  return (
    <section
      aria-labelledby="audit-title"
      className="rounded-[22px] border-[3px] border-ink bg-ink p-4 text-paper shadow-[5px_5px_0_var(--color-lime)] lg:rounded-[26px] lg:p-6 lg:pt-[22px] lg:shadow-[8px_8px_0_var(--color-lime)]"
    >
      <div className="flex items-center justify-between">
        <h2 id="audit-title" className="font-heading text-[26px] leading-[30px] font-extrabold tracking-[-0.8px] lg:text-[30px] lg:tracking-[-1px]">
          Audit
        </h2>
        <span className={cn("rounded-full px-3 py-1 text-[13px] font-extrabold tracking-[1px] text-ink lg:text-sm", all ? "bg-lime" : "bg-danger text-paper")}>
          {all ? "PASS" : "FAIL"} · {passed} of {checks.length}
        </span>
      </div>
      <p className="mt-1.5 text-sm leading-5 text-[#c9cdd6] lg:mt-2 lg:text-[14.5px] lg:leading-[21px]">
        Replays all {formatCount(data.entries)} entries and checks them against what the contract holds now.
      </p>
      <ul className="mt-2.5 lg:mt-3">
        {checks.map((check) => (
          <li key={check.title} className="flex items-start gap-2.5 border-t-[1.5px] border-[#23252b] py-[9px]">
            <span aria-hidden="true" className={cn("flex size-[22px] shrink-0 items-center justify-center rounded-full", check.pass ? "bg-lime" : "bg-danger")}>
              {check.pass ? <Check className="size-[13px] text-ink" strokeWidth={4} /> : <X className="size-[13px] text-paper" strokeWidth={4} />}
            </span>
            <p className="grow text-sm leading-5 lg:text-[14.5px] lg:leading-[21px]">
              <b className="font-bold">{check.title}</b>
              <br />
              <span className="text-[#c9cdd6]">{check.detail}</span>
            </p>
            <span className={cn("hidden shrink-0 text-[11.5px] font-extrabold tracking-[0.8px] lg:inline", check.pass ? "text-lime" : "text-danger")}>
              {check.pass ? "PASS" : "FAIL"}
            </span>
          </li>
        ))}
      </ul>
      <RerunAuditButton />
      <p className="mt-2.5 text-[12.5px] text-[#9aa0ae] lg:text-[13px]">
        {(ms / 1000).toFixed(1)} s{data.latestBlock !== null && ` · block ${formatCount(data.latestBlock)}`} · same result for everyone
      </p>
    </section>
  );
}

function ContractCard({ data }: { data: Receipts }) {
  const keys = data.fullAccessKeys;
  return (
    <section aria-labelledby="contract-title" className={cn(card, "px-4 pt-4 pb-3.5 lg:px-6 lg:pt-5 lg:pb-[18px]")}>
      <div className="flex flex-wrap items-center gap-2 lg:gap-2.5">
        <h2 id="contract-title" className="font-heading text-[22px] font-extrabold lg:text-2xl">
          {data.contractId}
        </h2>
        {keys !== null && (
          <span className={cn("rounded-full border-2 border-ink px-[9px] py-0.5 text-[11.5px] font-extrabold lg:px-2.5 lg:text-xs", keys === 0 ? "bg-lime" : "bg-danger text-paper")}>
            {formatCount(keys)} {keys === 1 ? "key" : "keys"}
          </span>
        )}
        <span className="rounded-full border-2 border-ink bg-canvas px-[9px] py-0.5 text-[11.5px] font-extrabold lg:px-2.5 lg:text-xs">NEP-141</span>
      </div>
      <dl className="mt-2.5">
        {data.params.map((param) => (
          <div key={param.label} className="flex justify-between gap-3 py-[5px] text-[13px] leading-[19px] lg:text-[13.5px]">
            <dt className="shrink-0 text-ink-3">{param.label}</dt>
            <dd className="text-right font-bold">{param.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 border-t-2 border-dashed border-ink pt-2.5 text-[13px] leading-[18px] font-semibold">Set once at launch. The contract has no method to change them.</p>
    </section>
  );
}
