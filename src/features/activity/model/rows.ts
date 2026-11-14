import type { JournalEntry } from "@/entities/journal";
import { NEAR_DECIMALS } from "@/shared/lib/amount";
import { formatAmount, formatUsd, formatUtcDate, formatUtcTime, isSameUtcDay, relativeUtcDay } from "@/shared/ui/format";

// The viewer's own history (Activity.dc.html, DeskActivity.dc.html): its buys, sells, saves and prizes,
// plus the moments everyone shares (the launch, every cut). Field names follow contracts/thecut/src/events.rs.

export type ActivityKind = "buy" | "sell" | "save" | "prize" | "cut";
export const ACTIVITY_FILTERS = ["all", "saves", "trades", "cuts"] as const;
export type ActivityFilter = (typeof ACTIVITY_FILTERS)[number];
export const ACTIVITY_FILTER_LABELS: Record<ActivityFilter, string> = { all: "All", saves: "Saves", trades: "Buys & sells", cuts: "Cuts & prizes" };

/** Events about the viewer's account. */
export const ACCOUNT_EVENTS = ["buy", "sell", "save", "unsave", "claim"] as const;
/** Events everyone sees: the launch and the cuts. */
export const SHARED_EVENTS = ["ft_mint", "cut"] as const;

const FILTER_KINDS: Record<ActivityFilter, readonly ActivityKind[]> = {
  all: ["buy", "sell", "save", "prize", "cut"],
  saves: ["save"],
  trades: ["buy", "sell"],
  cuts: ["prize", "cut"],
};

export function parseActivityFilter(value: string | string[] | undefined): ActivityFilter {
  return ACTIVITY_FILTERS.find((filter) => filter === value) ?? "all";
}

export type ActivityRow = {
  key: string;
  kind: ActivityKind;
  at: Date;
  txHash: string;
  title: string;
  sub: string;
  /** "$736.00", "+6.32 $CUT" or "Auto" for what the contract did on its own. */
  amount: string;
  auto: boolean;
};

export type ActivityContext = {
  names: ReadonlyMap<string, string>;
  /** Pool spot price of 1 $CUT, in yoctoNEAR. */
  priceYoctoNear: bigint;
  /** Null when no NEAR/USD rate is known: amounts stay in $CUT and NEAR. */
  usdCentsPerNear: bigint | null;
  firstCutAt: Date;
  cutAt: (index: number) => Date | null;
};

const ONE_NEAR = 10n ** BigInt(NEAR_DECIMALS);
const ONE_CUT = 10n ** 18n;

const cut1 = (value: bigint) => formatAmount(value, { maxFractionDigits: 1, minFractionDigits: 1 });
const cutText = (value: bigint) => formatAmount(value, { maxFractionDigits: 1 });
const nearText = (value: bigint) => formatAmount(value, { decimals: NEAR_DECIMALS, maxFractionDigits: 1 });

function big(data: Record<string, unknown>, key: string): bigint {
  const value = data[key];
  return typeof value === "string" && /^\d{1,39}$/.test(value) ? BigInt(value) : 0n;
}

/** yoctoNEAR → US cents, rounded half up. */
export function nearToUsdCents(yocto: bigint, usdCentsPerNear: bigint): bigint {
  return (yocto * usdCentsPerNear * 2n + ONE_NEAR) / (2n * ONE_NEAR);
}

function nearValue(yocto: bigint, ctx: ActivityContext): string {
  return ctx.usdCentsPerNear === null ? `${nearText(yocto)} NEAR` : formatUsd(nearToUsdCents(yocto, ctx.usdCentsPerNear));
}

function cutValue(amount: bigint, ctx: ActivityContext): string {
  if (ctx.usdCentsPerNear === null) return `${cutText(amount)} $CUT`;
  return formatUsd(nearToUsdCents((amount * ctx.priceYoctoNear) / ONE_CUT, ctx.usdCentsPerNear));
}

/** One line per journal entry, or null for an entry Activity does not show. */
export function activityRow(entry: JournalEntry, ctx: ActivityContext): ActivityRow | null {
  const d = entry.data;
  const time = formatUtcTime(entry.at);
  const agent = (id: unknown) => (typeof id === "string" ? (ctx.names.get(id) ?? id) : "");
  const base = { key: entry.id, at: entry.at, txHash: entry.txHash, auto: false };
  switch (entry.event) {
    case "buy":
      return { ...base, kind: "buy", title: `Bought ${cut1(big(d, "cut_out"))} $CUT`, sub: `${time} · paid ${nearText(big(d, "near_in"))} NEAR`, amount: nearValue(big(d, "near_in"), ctx) };
    case "sell":
      return { ...base, kind: "sell", title: `Sold ${cut1(big(d, "cut_in"))} $CUT`, sub: `${time} · got ${nearText(big(d, "near_out"))} NEAR`, amount: nearValue(big(d, "near_out"), ctx) };
    case "save": {
      const index = typeof d.cut_index === "number" ? d.cut_index : null;
      const at = index === null ? null : ctx.cutAt(index);
      return {
        ...base,
        kind: "save",
        title: `Saved ${cutText(big(d, "amount"))} $CUT on ${agent(d.agent_id)}`,
        sub: at ? `${time} · locked till ${formatUtcTime(at)} UTC` : time,
        amount: cutValue(big(d, "amount"), ctx),
      };
    }
    case "unsave":
      return {
        ...base,
        kind: "save",
        title: `Took back ${cutText(big(d, "amount"))} $CUT from ${agent(d.agent_id)}`,
        sub: `${time} · with ${cutText(big(d, "prize"))} $CUT of prize`,
        amount: cutValue(big(d, "amount"), ctx),
      };
    case "claim":
      return { ...base, kind: "prize", title: `Collected ${cutText(big(d, "amount"))} $CUT`, sub: `${time} · your prizes`, amount: `+${cutText(big(d, "amount"))} $CUT` };
    case "cut": {
      const name = agent(d.agent_id);
      return {
        ...base,
        kind: "cut",
        auto: true,
        title: name ? `${name} was cut` : "Nobody was cut",
        sub: name ? `${time} · ${cutText(big(d, "burned"))} burned · slices of ${cutText(big(d, "slice"))}` : `${time} · the stage was not full`,
        amount: "Auto",
      };
    }
    case "ft_mint": {
      const day = relativeUtcDay(entry.at, ctx.firstCutAt);
      const first = day === "today" ? "today" : day === "tomorrow" ? "tomorrow" : formatUtcDate(ctx.firstCutAt);
      return { ...base, kind: "cut", auto: true, title: "The show opened", sub: `${time} · first cut ${first}, ${formatUtcTime(ctx.firstCutAt)} UTC`, amount: "Auto" };
    }
    default:
      return null;
  }
}

export function filterRows(rows: readonly ActivityRow[], filter: ActivityFilter): ActivityRow[] {
  const kinds = FILTER_KINDS[filter];
  return rows.filter((row) => kinds.includes(row.kind));
}

/** Entries from several pages, newest first, without duplicates. */
export function mergeNewestFirst(...lists: readonly (readonly JournalEntry[])[]): JournalEntry[] {
  const seen = new Set<string>();
  return lists
    .flat()
    .filter((entry) => (seen.has(entry.id) ? false : (seen.add(entry.id), true)))
    .sort((a, b) => b.blockHeight - a.blockHeight || b.at.getTime() - a.at.getTime());
}

export type ActivityGroup<Row extends ActivityRow = ActivityRow> = { key: string; label: string; rows: Row[] };

/** Rows by UTC day: "TODAY · FRI, NOV 13", "THU, NOV 12 · LAUNCH DAY". */
export function groupByDay<Row extends ActivityRow>(rows: readonly Row[], now: Date, launchedAt: Date | null): ActivityGroup<Row>[] {
  const groups: ActivityGroup<Row>[] = [];
  for (const row of rows) {
    const key = row.at.toISOString().slice(0, 10);
    let group = groups.at(-1);
    if (!group || group.key !== key) {
      const date = formatUtcDate(row.at).toUpperCase();
      const label = isSameUtcDay(row.at, now) ? `TODAY · ${date}` : launchedAt && isSameUtcDay(row.at, launchedAt) ? `${date} · LAUNCH DAY` : date;
      group = { key, label, rows: [] };
      groups.push(group);
    }
    group.rows.push(row);
  }
  return groups;
}
