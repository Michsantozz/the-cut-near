import { cn } from "cn";
import { BarChart3, ChevronLeft, Gift, Scissors, TriangleAlert, Users } from "lucide-react";
import Link from "next/link";

import type { PriceRange } from "@/entities/market";
import { formatAmount, formatCount, formatUsd, formatUtcDate, formatUtcTime, relativeUtcDay } from "@/shared/ui/format";

import { chartGeometry, niceDomain, tickTimes, toChartValues, CHART_SIZE } from "../model/chart";
import { cutToNear, cutToUsdCents, shareBps, spotPrice } from "../model/money";
import type { ValueData } from "../server/load";
import { compactUsd, cutText, cutWhole, nearText, priceText, savedLine } from "./copy";
import { TimeLeft } from "./time-left";

const RANGES: { id: PriceRange; label: string; href: string }[] = [
  { id: "day", label: "1D", href: "/price?range=day" },
  { id: "week", label: "1W", href: "/price" },
  { id: "all", label: "All", href: "/price?range=all" },
];

const percent = (bps: number) => `${formatAmount(BigInt(bps), { decimals: 2, maxFractionDigits: 1 })}%`;
const shortDay = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" });
const tick = (at: Date, range: PriceRange) => (range === "day" ? formatUtcTime(at) : `${shortDay.format(at)} ${formatUtcTime(at)}`);

/** The laptop header's line: "Day 2 · trading since Thu, Nov 12, 15:01 UTC". */
export function valueSubtitle(data: ValueData): string {
  const day = `Day ${data.cutIndex + 1}`;
  return data.launchAt ? `${day} · trading since ${formatUtcDate(data.launchAt)}, ${formatUtcTime(data.launchAt)} UTC` : day;
}

/** "$CUT price" (Value.dc.html / DeskValue.dc.html): the price since launch and where all the $CUT are. No gains, no returns. */
export function ValueScreen({ data }: { data: ValueData }) {
  const rate = data.usdCentsPerNear;
  const spot = spotPrice(data.pool);
  const now = new Date(data.renderedAt);
  const cutDay = relativeUtcDay(now, data.cutAt);
  const { supply } = data;
  const current = supply.launch - supply.burned;
  const marketCap = rate !== null ? compactUsd(cutToUsdCents(current, spot, rate)) : `${nearText(cutToNear(current, spot))} NEAR`;

  return (
    <div className="mx-auto w-full max-w-[640px] px-5 pt-[18px] pb-6 lg:max-w-none lg:px-8 lg:pt-1 lg:pb-8">
      <div className="flex items-center justify-between lg:hidden">
        <Link
          href="/"
          aria-label="Back to the lineup"
          className="flex size-11 items-center justify-center rounded-[14px] border-2 border-ink bg-paper shadow-hard-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ChevronLeft aria-hidden="true" className="size-5" strokeWidth={2.6} />
        </Link>
        <p className="font-heading text-xl font-extrabold">$CUT price</p>
        <span aria-hidden="true" className="w-11" />
      </div>

      <div className="mt-3 lg:mt-0 lg:flex lg:items-start lg:gap-6">
        <section aria-label="Price" className="lg:min-w-0 lg:flex-1 lg:rounded-3xl lg:border-2 lg:border-ink lg:bg-paper lg:px-6 lg:pt-5 lg:pb-4 lg:shadow-hard">
          <div className="lg:flex lg:items-start lg:justify-between lg:gap-4">
            <Holdings data={data} spot={spot} />
            <div className="hidden lg:flex lg:flex-col lg:items-end lg:gap-2">
              <RangeTabs range={data.range} />
              <p className="text-[13.5px] font-semibold text-ink-3">
                1 $CUT = <b className="text-ink">{priceText(spot, rate)}</b>
              </p>
            </div>
          </div>
          <div className="mt-3 rounded-3xl border-2 border-ink bg-paper px-3.5 pt-3.5 pb-3 shadow-hard lg:mt-1 lg:rounded-none lg:border-0 lg:p-0 lg:shadow-none">
            <div className="flex items-center justify-between lg:hidden">
              <RangeTabs range={data.range} />
              <p className="text-[13px] font-semibold text-ink-3">1 $CUT = {priceText(spot, rate)}</p>
            </div>
            <PriceChart data={data} spot={spot} />
          </div>
        </section>

        <div className="mt-3 flex flex-col gap-3 lg:mt-0 lg:w-[336px] lg:shrink-0 lg:gap-4">
          <section aria-labelledby="supply-title" className="rounded-3xl border-2 border-ink bg-paper px-4 pt-3.5 pb-3.5 shadow-hard lg:px-5 lg:pt-[18px] lg:pb-5">
            <h2 id="supply-title" className="text-[17px] font-extrabold lg:text-lg">
              Where all {cutWhole(supply.launch)} $CUT are
            </h2>
            <div
              role="img"
              aria-label={`Saved in piles ${percent(shareBps(supply.saved, supply.launch))}, free ${percent(shareBps(supply.free, supply.launch))}, burned ${percent(shareBps(supply.burned, supply.launch))}`}
              className="mt-3 flex h-[22px] overflow-hidden rounded-full border-2 border-ink bg-canvas"
            >
              <span className="h-full bg-lime" style={{ width: `${shareBps(supply.saved, supply.launch) / 100}%` }} />
              <span className="h-full border-l-2 border-ink bg-canvas" style={{ width: `${shareBps(supply.free, supply.launch) / 100}%` }} />
              {supply.burned > 0n && <span className="h-full border-l-2 border-ink bg-danger" style={{ width: `${shareBps(supply.burned, supply.launch) / 100}%` }} />}
            </div>
            <dl className="mt-2.5">
              <SupplyRow swatch="bg-lime" label="Saved in piles" sub={percent(shareBps(supply.saved, supply.launch))} value={cutWhole(supply.saved)} />
              <SupplyRow swatch="bg-paper" label="Free" sub={percent(shareBps(supply.free, supply.launch))} value={cutWhole(supply.free)} />
              <SupplyRow
                swatch="bg-danger"
                label="Burned"
                sub={supply.burned > 0n ? percent(shareBps(supply.burned, supply.launch)) : `first burn${cutDay ? ` ${cutDay}` : ""}, ${formatUtcTime(data.cutAt)} UTC`}
                value={cutWhole(supply.burned)}
              />
            </dl>
            <p className="mt-2.5 flex items-center gap-2.5 rounded-xl bg-lime-soft px-3 py-2.5 text-sm font-bold lg:rounded-2xl lg:border-2 lg:border-ink lg:px-3.5">
              <Gift aria-hidden="true" className="size-4 shrink-0" strokeWidth={2.4} />
              <span className="flex grow flex-wrap items-baseline justify-between gap-x-2 lg:block">
                <span className="lg:block lg:text-xs lg:font-semibold lg:text-ink-3">Fees for {cutDay === "today" ? "today’s" : cutDay === "tomorrow" ? "tomorrow’s" : "the next"} prize</span>
                <span className="lg:block lg:font-heading lg:text-lg lg:font-extrabold">{cutWhole(data.feesSoFar)} $CUT so far</span>
              </span>
            </p>
          </section>

          <Risk className="lg:order-last" />

          <section aria-label="Numbers" className="grid grid-cols-3 gap-2 lg:grid-cols-1 lg:gap-0 lg:rounded-3xl lg:border-2 lg:border-ink lg:bg-paper lg:px-5 lg:py-2 lg:shadow-hard">
            <Stat icon={BarChart3} tile="bg-sky" label="Market cap" value={marketCap} />
            {data.holders !== null && <Stat icon={Users} tile="bg-pink" label="Holders" value={formatCount(data.holders)} />}
            <Stat icon={Scissors} tile="bg-[#ffd84d]" label="Next cut" value={<TimeLeft cutAt={data.cutAt.getTime()} renderedAt={data.renderedAt} />} />
          </section>
        </div>
      </div>
    </div>
  );
}

function Holdings({ data, spot }: { data: ValueData; spot: bigint }) {
  const account = data.account;
  if (!account) {
    return (
      <div>
        <p className="text-[13px] font-semibold text-ink-3 lg:text-sm">1 $CUT</p>
        <p className="font-heading text-[44px] leading-[50px] font-extrabold tracking-[-1.5px] lg:text-[52px] lg:leading-[58px] lg:tracking-[-1.8px]">
          {priceText(spot, data.usdCentsPerNear)}
        </p>
      </div>
    );
  }
  const savedTotal = account.saves.reduce((sum, save) => sum + save.amount, 0n);
  const total = account.free + savedTotal;
  const saved = savedLine(account.saves);
  const rate = data.usdCentsPerNear;
  return (
    <div className="lg:min-w-0">
      <p className="text-[13px] font-semibold text-ink-3 lg:text-sm">Your {cutText(total)} $CUT</p>
      <div className="lg:flex lg:flex-wrap lg:items-center lg:gap-x-3.5">
        <p className="font-heading text-[44px] leading-[50px] font-extrabold tracking-[-1.5px] lg:text-[52px] lg:leading-[58px] lg:tracking-[-1.8px]">
          {rate !== null ? formatUsd(cutToUsdCents(total, spot, rate)) : `${nearText(cutToNear(total, spot))} NEAR`}
        </p>
        <p className="mt-1 inline-block rounded-full border-2 border-ink bg-paper px-2.5 py-0.5 text-[13.5px] font-bold lg:mt-0">
          {cutText(account.free)} free{saved ? ` · ${saved}` : ""}
        </p>
      </div>
    </div>
  );
}

function RangeTabs({ range }: { range: PriceRange }) {
  return (
    <nav aria-label="Range" className="flex gap-1.5 lg:gap-0.5 lg:rounded-[14px] lg:border-2 lg:border-ink lg:bg-canvas lg:p-[3px]">
      {RANGES.map((r) => (
        <Link
          key={r.id}
          href={r.href}
          scroll={false}
          aria-current={r.id === range ? "page" : undefined}
          className="flex h-[34px] min-w-12 items-center justify-center rounded-full border-2 border-ink bg-paper px-3 text-sm font-extrabold outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-[current=page]:bg-ink aria-[current=page]:text-paper lg:h-9 lg:min-w-14 lg:rounded-[11px] lg:border-0 lg:bg-transparent"
        >
          {r.label}
        </Link>
      ))}
    </nav>
  );
}

function PriceChart({ data, spot }: { data: ValueData; spot: bigint }) {
  const rate = data.usdCentsPerNear;
  const values = toChartValues(data.prices, rate);
  const domain = niceDomain(values.map((p) => p.v));
  const geo = chartGeometry(values, domain);
  const ticks = tickTimes(data.prices);
  const unit = (v: number) => (rate !== null ? `$${v.toFixed(2)}` : `${v.toFixed(3)}`);
  const first = data.prices[0]?.at;
  const launch = data.launchAt ?? first;
  const plainDate = (at: Date) => formatUtcDate(at).replace(",", "");
  const caption = data.range === "day" ? (first ? `Today, ${plainDate(first)}` : "Today") : launch ? `Since launch, ${plainDate(launch)}` : "Since launch";

  if (values.length === 0) {
    return <p className="flex h-[150px] items-center justify-center text-sm font-semibold text-ink-3 lg:h-[440px]">No trades yet in this range.</p>;
  }

  return (
    <figure className="mt-2.5 lg:mt-9">
      <div className="flex gap-3">
        <div aria-hidden="true" className="relative hidden w-11 shrink-0 lg:block">
          {domain.ticks.map((v) => (
            <span key={v} className="absolute -translate-y-1/2 text-xs font-semibold text-ink-3" style={{ top: `${geo.yPercent(v)}%` }}>
              {unit(v)}
            </span>
          ))}
        </div>
        <div className="relative h-[140px] grow lg:h-[436px]">
          <svg viewBox={`0 0 ${CHART_SIZE} ${CHART_SIZE}`} preserveAspectRatio="none" aria-hidden="true" className="absolute inset-0 size-full overflow-visible">
            <defs>
              <linearGradient id="price-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-blue)" stopOpacity="0.22" />
                <stop offset="100%" stopColor="var(--color-blue)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {domain.ticks.map((v) => (
              <line
                key={v}
                x1="0"
                x2={CHART_SIZE}
                y1={(geo.yPercent(v) * CHART_SIZE) / 100}
                y2={(geo.yPercent(v) * CHART_SIZE) / 100}
                stroke="var(--color-line)"
                strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
                className="hidden lg:block"
              />
            ))}
            <path d={geo.area} fill="url(#price-fill)" />
            <path d={geo.line} fill="none" stroke="var(--color-blue)" strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            {geo.last && (
              <line
                x1={(geo.last.x * CHART_SIZE) / 100}
                x2={(geo.last.x * CHART_SIZE) / 100}
                y1={(geo.last.y * CHART_SIZE) / 100}
                y2={CHART_SIZE}
                stroke="var(--color-ink)"
                strokeWidth="1.5"
                strokeDasharray="3 4"
                vectorEffect="non-scaling-stroke"
                className="hidden lg:block"
              />
            )}
          </svg>
          {geo.last && (
            <>
              <span
                aria-hidden="true"
                className="absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink bg-lime"
                style={{ left: `${geo.last.x}%`, top: `${geo.last.y}%` }}
              />
              <span
                className="absolute hidden h-[30px] -translate-x-full -translate-y-[calc(100%+12px)] items-center rounded-[10px] bg-ink px-[11px] text-[13.5px] font-extrabold whitespace-nowrap text-paper lg:inline-flex"
                style={{ left: `${geo.last.x}%`, top: `${geo.last.y}%` }}
              >
                {priceText(spot, rate)} · now
              </span>
            </>
          )}
        </div>
      </div>
      <div aria-hidden="true" className="mt-2 flex justify-between text-xs font-semibold text-ink-3 lg:ml-14 lg:text-[13px]">
        {ticks.map((at, i) => (
          <span key={i}>{tick(at, data.range)}</span>
        ))}
      </div>
      <figcaption className="mt-2.5 flex items-center justify-between border-t-[1.5px] border-canvas pt-2.5 text-[13px] font-semibold lg:mt-3.5 lg:pt-3 lg:text-[13.5px]">
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="h-1 w-5 rounded-[2px] bg-blue" />
          Price {priceText(spot, rate)}
        </span>
        <span className="text-ink-3">{caption}</span>
      </figcaption>
    </figure>
  );
}

function SupplyRow({ swatch, label, sub, value }: { swatch: string; label: string; sub: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5 border-t-[1.5px] border-canvas py-[7px] first:border-t-0 lg:py-2.5">
      <span aria-hidden="true" className={cn("size-3.5 shrink-0 rounded-[4px] border-2 border-ink", swatch)} />
      <dt className="grow text-sm lg:text-[14.5px]">
        <b className="font-bold">{label}</b> <span className="text-ink-3 lg:block lg:text-xs">{sub}</span>
      </dt>
      <dd className="text-[15px] font-extrabold lg:font-heading lg:text-lg">{value}</dd>
    </div>
  );
}

function Stat({ icon: Icon, tile, label, value }: { icon: typeof Gift; tile: string; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border-2 border-ink bg-paper px-3 py-2 lg:flex lg:items-center lg:gap-3.5 lg:rounded-none lg:border-0 lg:border-t-[1.5px] lg:border-canvas lg:px-0 lg:py-3 lg:first:border-t-0">
      <span aria-hidden="true" className={cn("hidden size-[38px] shrink-0 items-center justify-center rounded-xl border-2 border-ink lg:flex", tile)}>
        <Icon className="size-[18px]" strokeWidth={2.4} />
      </span>
      <p className="flex items-center gap-1 text-xs font-semibold text-ink-3 lg:grow lg:text-[15px] lg:text-ink-2">
        <Icon aria-hidden="true" className="size-3 lg:hidden" strokeWidth={2.4} />
        {label}
      </p>
      <p className="font-heading text-lg leading-6 font-extrabold whitespace-nowrap lg:text-2xl">{value}</p>
    </div>
  );
}

function Risk({ className }: { className?: string }) {
  return (
    <p className={cn("flex items-start gap-2.5 rounded-2xl border-2 border-ink bg-danger-soft px-3.5 py-3 text-sm leading-5 font-semibold", className)}>
      <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={2.4} />
      $CUT has nothing behind it. Its price can fall close to zero.
    </p>
  );
}
