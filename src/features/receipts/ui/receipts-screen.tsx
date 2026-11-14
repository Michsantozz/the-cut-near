import { cn } from "cn";
import { Check, ChevronDown, Clock, Scissors, TrendingUp, TriangleAlert, Trophy, Wallet, X, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { scoreShown, tenthsToPass } from "@/entities/agent";
import { NEAR_DECIMALS } from "@/shared/lib/amount";
import { formatAmount, formatCount, formatCutTenths, formatDuration, formatSignificant, formatUsd, formatUtcDate, formatUtcTime, relativeUtcDay } from "@/shared/ui/format";
import { ConnectButton } from "@/shared/wallet";

import { cutText, whenText, type CutReceipt, type ReceiptTag } from "../model/describe";
import { FILTER_LABELS, RECEIPT_FILTERS, receiptsHref } from "../model/filters";
import { percentText } from "../model/supply";
import type { Receipts, ReceiptRow } from "../server/load-receipts";
import { JournalUpdating } from "./journal-updating";
import { RerunAuditButton } from "./rerun-audit-button";

// The Receipts page (Receipts.dc.html, ReceiptsPhone.dc.html): the public log of every mint, burn, trade, save,
// boo, move, cut and prize, with an audit against the contract. Sample mode says so everywhere and links nowhere.
// Colors outside the app tokens are the design's own.

const card = "rounded-[22px] border-[2.5px] border-ink bg-paper shadow-hard lg:rounded-[26px] lg:border-[3px] lg:shadow-hard-lg";

const TAG_STYLE: Record<ReceiptTag, string> = {
  launch: "bg-ink text-paper",
  buy: "bg-sky",
  sell: "bg-line-3",
  fee: "bg-[#ffd84d]",
  save: "bg-pink",
  unsave: "bg-paper",
  boo: "bg-orange",
  move: "bg-violet text-paper",
  pact: "bg-sky",
  attack: "bg-danger text-paper",
  rescue: "bg-lime",
  inherit: "bg-violet-soft",
  cut: "border-dashed bg-paper text-[#d2261e]",
  burn: "bg-danger text-paper",
  prize: "bg-lime",
  join: "bg-lime",
  season: "bg-violet text-paper",
  champion: "bg-[#ffd84d]",
  delete: "bg-ink text-paper",
  claim: "bg-lime",
  other: "bg-canvas",
};

const cutWhole = (value: bigint) => formatAmount(value, { maxFractionDigits: 0 });
/** A big $CUT amount, short: "2.3M", "940K", "812". */
const compactCut = (value: bigint) =>
  value >= 10n ** 24n
    ? `${formatAmount(value, { decimals: 24, maxFractionDigits: 1 })}M`
    : value >= 10n ** 21n
      ? `${formatAmount(value, { decimals: 21, maxFractionDigits: 0 })}K`
      : cutWhole(value);

/** `updating`: the server is still reading the newest blocks into the journal; the page loads again shortly. */
export function ReceiptsScreen({ data, updating = false }: { data: Receipts; updating?: boolean }) {
  const now = new Date(data.renderedAt);
  return (
    <div className="mx-auto w-full max-w-[640px] px-4 pb-8 lg:max-w-none lg:px-8">
      <Hero data={data} updating={updating} />
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
        {data.live ? "" : "Sample world. Every agent, account, move and number here is made up; nothing is read from NEAR. "}A $CUT transfer between
        two wallets is not in the journal.
      </p>
    </div>
  );
}

function Hero({ data, updating }: { data: Receipts; updating: boolean }) {
  const at = new Date(data.renderedAt);
  return (
    <div className="lg:flex lg:items-start lg:justify-between lg:gap-8 lg:pt-2">
      <div className="lg:max-w-[820px]">
        {/* Phone title, same size as the other tab pages (Prizes). */}
        <h2 className="pt-4 font-heading text-[32px] leading-9 font-extrabold tracking-[-1px] lg:hidden">Receipts</h2>
        <SourceChip data={data} className="mt-2 lg:hidden" />
        <p className="mt-3 text-base leading-[23px] font-medium lg:mt-0 lg:text-[21px] lg:leading-[30px]">
          {data.live
            ? "Every buy, save, boo, move, cut, burn and prize since launch, from the contract’s public log on NEAR. Every entry links to its transaction."
            : "Every buy, save, boo, move, cut, burn and prize of the sample world, the way the contract logs them. In live mode each entry links to its transaction on NEAR."}
        </p>
      </div>
      <div className="mt-2 lg:mt-1 lg:flex lg:shrink-0 lg:flex-col lg:items-end lg:gap-2.5">
        <SourceChip data={data} className="hidden lg:inline-flex" />
        <p className="text-[12.5px] leading-[17px] font-semibold text-ink-3 lg:text-[13.5px]">
          {data.latestBlock !== null && `Block ${formatCount(data.latestBlock)} · `}
          {formatCount(data.entries)} journal entries since launch{data.launchedAt && `, ${formatUtcDate(data.launchedAt).replace(",", "")}`}
          {!data.live && data.stats.usdCentsPerNear !== null && ` · Sample world, 1 NEAR = ${formatUsd(data.stats.usdCentsPerNear)}`}
        </p>
        {updating && <JournalUpdating />}
        <span className="sr-only">Read at {formatUtcTime(at)} UTC</span>
      </div>
    </div>
  );
}

function SourceChip({ data, className }: { data: Receipts; className?: string }) {
  return (
    <span
      className={cn(
        // On a phone the long contract name wraps inside the pill instead of pushing the page sideways.
        "inline-flex min-h-8 max-w-full items-center gap-2 rounded-full border-2 border-ink bg-paper px-3 py-1 text-[12.5px] leading-4 font-extrabold lg:h-[38px] lg:border-[2.5px] lg:px-4 lg:py-0 lg:text-sm lg:whitespace-nowrap",
        className,
      )}
    >
      {data.live ? (
        <>
          <span aria-hidden="true" className="size-[9px] rounded-full bg-[#2fbf4a] shadow-[0_0_0_4px_rgb(47_191_74/0.25)] lg:size-2.5" />
          LIVE · read at {formatUtcTime(new Date(data.renderedAt))} UTC from {data.contractId}
        </>
      ) : (
        <>
          <span aria-hidden="true" className="size-[9px] rounded-full border-[1.5px] border-ink bg-violet lg:size-2.5" />
          <span className="lg:hidden">SAMPLE WORLD · made up, not from NEAR</span>
          <span className="hidden lg:inline">SAMPLE WORLD · made-up entries, nothing read from NEAR</span>
        </>
      )}
    </span>
  );
}

type Stat = { label: string; value: string; sub: string; icon: LucideIcon; bg: string };

function StatCards({ data, now }: { data: Receipts; now: Date }) {
  const { stats } = data;
  const nearPrice = `${formatSignificant(stats.priceYoctoNear, { decimals: NEAR_DECIMALS, maxFractionDigits: 3 })} NEAR`;
  const usdCents = stats.usdCentsPerNear !== null ? (stats.priceYoctoNear * stats.usdCentsPerNear * 2n + 10n ** 24n) / (2n * 10n ** 24n) : 0n;
  // Under a cent the dollar price reads "$0.00", and under 0.001 NEAR the NEAR price is a row of zeros:
  // then the card shows how much $CUT one NEAR buys, and the exact price goes underneath.
  const tiny = usdCents < 1n && stats.priceYoctoNear > 0n && stats.priceYoctoNear < 10n ** 21n;
  const price = usdCents >= 1n ? formatUsd(usdCents) : tiny ? compactCut(10n ** 42n / stats.priceYoctoNear) : nearPrice;
  const priceLabel = tiny ? "$CUT PER NEAR" : "$CUT PRICE";
  const priceSub = tiny
    ? `${nearPrice} each, from the pool`
    : stats.usdCentsPerNear !== null
      ? `${usdCents >= 1n ? `${nearPrice} · ` : ""}1 NEAR = ${formatUsd(stats.usdCentsPerNear)}`
      : "In NEAR, from the pool";
  const day = relativeUtcDay(now, stats.cutAt);
  const lastCut = stats.lastCut;
  const { season } = stats;
  const items: Stat[] = [
    { label: priceLabel, value: price, sub: priceSub, icon: TrendingUp, bg: "bg-paper" },
    {
      label: "SEASON POT",
      value: cutWhole(season.pot),
      sub: season.active ? `$CUT · season ${season.index}, day ${season.day} · to the champion’s savers` : "$CUT · waits for the next season",
      icon: Trophy,
      bg: "bg-paper",
    },
    { label: "FEES SO FAR", value: cutWhole(stats.feesSoFar), sub: "$CUT · to today’s prize", icon: Wallet, bg: "bg-[#ffd84d]" },
    {
      label: "ON THE CUT LINE",
      value: stats.lowest?.name ?? "Nobody",
      sub: stats.lowest ? `Score ${formatCutTenths(scoreShown(stats.lowest.score))}${stats.gap > 0n ? ` · ${formatCutTenths(tenthsToPass(stats.gap))} to pass` : ""}` : "No season on the stage",
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
      label: "AGENTS CUT",
      value: formatCount(stats.cuts),
      sub: lastCut?.agentName ? `Last: ${lastCut.agentName}, ${cutWhole(lastCut.burned)} burned` : "Nobody yet",
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
    { label: "BURNED", value: cutWhole(supply.burned), sub: supply.burned > 0n ? "Boos, attacks, think fees, cuts" : "Nothing burned yet", dot: "bg-danger" },
    { label: "SAVED IN PILES", value: cutWhole(supply.saved), sub: "Locked till the cut", dot: "bg-lime" },
    { label: "FREE", value: cutWhole(supply.free), sub: "In wallets and the pool", dot: "bg-paper" },
  ];
  const savedWidth = Math.max(supply.savedPermille / 10, 0.5);
  // A thin saved bar cannot hold its own label: then it moves to the free side, as on the phone.
  const labelInBar = supply.savedPermille >= 60;
  return (
    <section aria-labelledby="supply-title" className={cn(card, "mt-[22px] p-4 lg:mt-12 lg:px-6 lg:pt-5 lg:pb-[22px]")}>
      <div className="lg:flex lg:items-baseline lg:justify-between">
        <h2 id="supply-title" className="font-heading text-2xl leading-7 font-extrabold tracking-[-0.8px] lg:text-[30px] lg:leading-9 lg:tracking-[-1px]">
          Where all {cutWhole(supply.minted)} $CUT are
        </h2>
        <p className="mt-0.5 text-[13px] font-semibold text-ink-3 lg:text-sm">Minted once at launch. Supply only drops: every boo, attack, think fee and cut burns.</p>
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
          {labelInBar && <span className="hidden lg:inline">{percentText(supply.savedPermille)}</span>}
        </div>
        <div className="flex grow items-center bg-[repeating-linear-gradient(135deg,var(--color-paper)_0_8px,var(--color-canvas)_8px_16px)] pl-2 text-[11px] font-extrabold whitespace-nowrap text-ink-3 lg:pl-3 lg:text-xs">
          <span>
            <span className={labelInBar ? "lg:hidden" : undefined}>{percentText(supply.savedPermille)} saved · </span>
            {percentText(supply.freePermille)} free · {cutWhole(supply.burned)} burned
          </span>
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
        <p className="mt-0.5 text-[13px] font-semibold text-ink-3 lg:text-[13.5px]">{data.live ? "Newest first · every entry links to NEAR" : "Newest first · sample entries, nothing to open on NEAR"}</p>
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
          {groupRuns(data.rows).map((run) =>
            run.length >= RUN_MIN ? <JournalRun key={run[0]!.key} rows={run} now={now} /> : <JournalRow key={run[0]!.key} row={run[0]!} now={now} />,
          )}
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

/** Back-to-back entries of the same kind fold into one line from this many on (a cut never folds). */
const RUN_MIN = 3;

/** Splits the journal into runs: consecutive rows of the same kind; a short run becomes single rows again. */
function groupRuns(rows: ReceiptRow[]): ReceiptRow[][] {
  const runs: ReceiptRow[][] = [];
  for (const row of rows) {
    const last = runs.at(-1);
    if (last && last[0]!.tag === row.tag && row.tag !== "cut") last.push(row);
    else runs.push([row]);
  }
  return runs.flatMap((run) => (run.length >= RUN_MIN ? [run] : run.map((row) => [row])));
}

/** A run of same-kind entries as one line that opens to show each of them. */
function JournalRun({ rows, now }: { rows: ReceiptRow[]; now: Date }) {
  const first = rows[0]!;
  const newest = whenText(first.at, now);
  const oldest = whenText(rows.at(-1)!.at, now);
  return (
    <li className="border-t-[1.5px] border-line">
      <details className="group">
        <summary className="-mx-2 flex cursor-pointer list-none items-center gap-2 rounded-xl px-2 py-[11px] outline-none hover:bg-canvas focus-visible:ring-3 focus-visible:ring-ring/50 lg:min-h-14 lg:gap-3.5 lg:py-[7px] [&::-webkit-details-marker]:hidden">
          <Tag tag={first.tag} label={first.label} />
          <span className="hidden w-[116px] shrink-0 text-[13px] leading-[17px] font-semibold text-ink-3 lg:block">{newest === oldest ? newest : `${newest} to ${oldest}`}</span>
          <span className="min-w-0 grow">
            <span className="block text-[14.5px] leading-5 font-bold">
              {formatCount(rows.length)} {first.label.toLowerCase()} entries in a row
            </span>
            <span className="block truncate text-[13px] leading-[18px] text-ink-3 lg:text-[14.5px] lg:leading-5">Newest: {first.what}</span>
          </span>
          <span className="flex shrink-0 items-center gap-1 text-[12.5px] font-bold lg:text-[13px]">
            <span className="group-open:hidden">Show all</span>
            <span className="hidden group-open:inline">Hide</span>
            <ChevronDown aria-hidden="true" className="size-4 transition-transform group-open:rotate-180" strokeWidth={2.6} />
          </span>
        </summary>
        <ol className="mb-2 rounded-xl bg-canvas/60 px-3 lg:px-4 [&>li:first-child]:border-t-0">
          {rows.map((row) => (
            <JournalRow key={row.key} row={row} now={now} />
          ))}
        </ol>
      </details>
    </li>
  );
}

function JournalRow({ row, now }: { row: ReceiptRow; now: Date }) {
  return (
    <li className="border-t-[1.5px] border-line py-[11px] transition-colors lg:flex lg:hover:bg-ink/5 lg:min-h-14 lg:items-center lg:gap-3.5 lg:py-[7px]">
      <div className="flex items-center gap-2 lg:contents">
        <Tag tag={row.tag} label={row.label} />
        <time dateTime={row.at.toISOString()} className="min-w-0 grow text-[12.5px] font-semibold whitespace-nowrap text-ink-3 lg:order-0 lg:w-[116px] lg:shrink-0 lg:grow-0 lg:text-[13px] lg:leading-[17px] lg:whitespace-normal">
          {whenText(row.at, now)}
        </time>
        {row.href ? (
          <a
            href={row.href}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-[12.5px] font-bold underline underline-offset-2 lg:order-last lg:text-[13px]"
            aria-label={`See this ${row.label.toLowerCase()} on NEAR`}
          >
            NEAR ↗
          </a>
        ) : (
          <span className="shrink-0 text-[12px] font-bold text-ink-4 lg:order-last lg:w-[50px] lg:text-right">Sample</span>
        )}
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
        {cut.agentName && (cut.heirName || cut.wallet > 0n) && (
          <>
            Its wallet of <b className="font-bold text-ink">{cutText(cut.wallet)} $CUT</b> {cut.heirName ? `went to its heir ${cut.heirName}` : "burned: no living heir"} ·{" "}
          </>
        )}
        {cut.agentAccountId ? `${cut.agentAccountId} deleted · ` : ""}run by <b className="font-bold text-ink">{cut.runner}</b>, who keeps the account’s leftover NEAR
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
        <p className="text-[14.5px] leading-5 font-bold">{pending.index === 1 ? "First cut" : `Cut #${pending.index}`}: the lowest score is cut</p>
        <p className="mt-px text-[13px] leading-[18px] text-ink-3 lg:mt-0 lg:text-[14.5px] lg:leading-5">
          {pending.lowest ? `Right now ${pending.lowest.name}, score ${formatCutTenths(scoreShown(pending.lowest.score))}. ` : ""}Pacts pay, attacks burn, half its pile burns, the rest
          plus the day’s fees goes to the survivors.
        </p>
      </div>
    </li>
  );
}

function AuditCard({ data }: { data: Receipts }) {
  const { checks, ms } = data.audit;
  const passed = checks.filter((check) => check.pass).length;
  const all = passed === checks.length;
  // Sample mode replays the sample journal: it shows the numbers add up, never a pass on a real contract.
  const ok = data.live ? "PASS" : "ADDS UP";
  const badge = data.live ? `${all ? "PASS" : "FAIL"} · ${passed} of ${checks.length}` : `SAMPLE · ${passed} of ${checks.length} add up`;
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
          {badge}
        </span>
      </div>
      <p className="mt-1.5 text-sm leading-5 text-[#c9cdd6] lg:mt-2 lg:text-[14.5px] lg:leading-[21px]">
        {data.live
          ? `Replays all ${formatCount(data.entries)} entries and checks them against what the contract holds now.`
          : `Replays all ${formatCount(data.entries)} entries of the sample journal against the sample world. Live mode checks the contract on NEAR.`}
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
              {check.pass ? ok : "FAIL"}
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
        {data.live ? (
          keys !== null && (
            <span className={cn("rounded-full border-2 border-ink px-[9px] py-0.5 text-[11.5px] font-extrabold lg:px-2.5 lg:text-xs", keys === 0 ? "bg-lime" : "bg-danger text-paper")}>
              {formatCount(keys)} {keys === 1 ? "key" : "keys"}
            </span>
          )
        ) : (
          <span className="rounded-full border-2 border-ink bg-violet-soft px-[9px] py-0.5 text-[11.5px] font-extrabold lg:px-2.5 lg:text-xs">Sample</span>
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
      <p className="mt-2 border-t-2 border-dashed border-ink pt-2.5 text-[13px] leading-[18px] font-semibold">
        {data.live ? "Set once at launch. The contract has no method to change them." : "Sample values, the same as the testnet launch. The contract has no method to change them."}
      </p>
    </section>
  );
}
