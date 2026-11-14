import type { JournalEntry } from "@/entities/journal";
import { NEAR_DECIMALS } from "@/shared/lib/amount";
import { formatAmount, formatCount, formatUtcDate, formatUtcTime, relativeUtcDay } from "@/shared/ui/format";

// One journal line as the Receipts page writes it. Field names follow contracts/thecut/src/events.rs.

export type ReceiptTag = "launch" | "buy" | "sell" | "fee" | "save" | "unsave" | "cut" | "burn" | "prize" | "join" | "delete" | "claim" | "other";

/** Entries of one NEP-297 event in one transaction (a join of 10 robots, a prize for 9 survivors) read as one line. */
export type ReceiptGroup = { key: string; event: string; txHash: string; at: Date; entries: JournalEntry[] };

export type CutReceipt = {
  index: number;
  robotId: string | null;
  robotName: string | null;
  robotAccountId: string | null;
  pile: bigint;
  burned: bigint;
  prize: bigint;
  slice: bigint;
  creatorSlice: bigint;
  survivors: number;
  runner: string;
};

export type ReceiptLine = {
  key: string;
  tag: ReceiptTag;
  label: string;
  at: Date;
  txHash: string;
  what: string;
  detail: string;
  /** Set on `cut` lines: the cut's receipt. */
  cut: CutReceipt | null;
};

export type DescribeContext = {
  /** Robot names by id; unknown robots keep their id. */
  names: ReadonlyMap<string, string>;
  now: Date;
  /** When cut `index` is (or was) scheduled, or null when unknown. */
  cutAt: (index: number) => Date | null;
  /** Every entry of a transaction on this page, to tell a fee which trade it came from. */
  siblings: (txHash: string) => readonly JournalEntry[];
};

const LABELS: Record<ReceiptTag, string> = {
  launch: "LAUNCH",
  buy: "BUY",
  sell: "SELL",
  fee: "FEE",
  save: "SAVE",
  unsave: "UNSAVE",
  cut: "CUT",
  burn: "BURN",
  prize: "PRIZE",
  join: "JOIN",
  delete: "DELETE",
  claim: "CLAIM",
  other: "EVENT",
};

const TAGS: Record<string, ReceiptTag> = {
  ft_mint: "launch",
  ft_burn: "burn",
  buy: "buy",
  sell: "sell",
  fee: "fee",
  save: "save",
  unsave: "unsave",
  cut: "cut",
  prize: "prize",
  join: "join",
  register: "join",
  delete: "delete",
  claim: "claim",
};

/** Consecutive entries of the same event in the same transaction, newest first. */
export function groupEntries(entries: readonly JournalEntry[]): ReceiptGroup[] {
  const groups: ReceiptGroup[] = [];
  for (const entry of entries) {
    const last = groups.at(-1);
    if (last && last.txHash === entry.txHash && last.event === entry.event) last.entries.push(entry);
    else groups.push({ key: entry.id, event: entry.event, txHash: entry.txHash, at: entry.at, entries: [entry] });
  }
  for (const group of groups) group.entries.reverse();
  return groups;
}

/** $CUT with up to one decimal: "1,775.4", "400". */
export const cutText = (value: bigint) => formatAmount(value, { maxFractionDigits: 1 });
/** NEAR with up to one decimal: "85.9". */
export const nearText = (value: bigint) => formatAmount(value, { decimals: NEAR_DECIMALS, maxFractionDigits: 1 });

function str(data: Record<string, unknown>, key: string): string {
  const value = data[key];
  return typeof value === "string" ? value : "";
}

function big(data: Record<string, unknown>, key: string): bigint {
  const value = data[key];
  return typeof value === "string" && /^\d{1,39}$/.test(value) ? BigInt(value) : 0n;
}

function num(data: Record<string, unknown>, key: string): number {
  const value = data[key];
  return typeof value === "number" ? value : typeof value === "string" && /^\d{1,15}$/.test(value) ? Number(value) : 0;
}

/** "To today’s prize", or the prize of the day the cut runs. */
function prizeOf(ctx: DescribeContext, cutIndex: number): string {
  const at = ctx.cutAt(cutIndex);
  if (!at) return `To the prize of cut #${cutIndex}`;
  const day = relativeUtcDay(ctx.now, at);
  if (day === "today") return "To today’s prize";
  if (day === "tomorrow") return "To tomorrow’s prize";
  return `To the ${formatUtcDate(at)} prize`;
}

export function cutReceipt(data: Record<string, unknown>, names: ReadonlyMap<string, string>): CutReceipt {
  const robotId = str(data, "robot_id") || null;
  return {
    index: num(data, "cut_index"),
    robotId,
    robotName: robotId ? (names.get(robotId) ?? robotId) : null,
    robotAccountId: str(data, "robot_account_id") || null,
    pile: big(data, "pile"),
    burned: big(data, "burned"),
    prize: big(data, "prize"),
    slice: big(data, "slice"),
    creatorSlice: big(data, "creator_slice"),
    survivors: num(data, "survivors"),
    runner: str(data, "runner"),
  };
}

/** What happened, in one line plus one detail line. */
export function describeGroup(group: ReceiptGroup, ctx: DescribeContext): ReceiptLine {
  const tag = TAGS[group.event] ?? "other";
  const [first] = group.entries;
  const d = first.data;
  const name = (id: string) => ctx.names.get(id) ?? id;
  const robot = name(str(d, "robot_id"));
  const n = group.entries.length;
  let what = group.event;
  let detail = "";
  let cut: CutReceipt | null = null;

  switch (group.event) {
    case "ft_mint":
      what = `${cutText(big(d, "amount"))} $CUT minted, once`;
      detail = "The contract has no mint method.";
      break;
    case "ft_burn": {
      const memo = str(d, "memo");
      what = `${cutText(big(d, "amount"))} $CUT burned`;
      detail = memo.startsWith("cut ") ? `At cut #${memo.slice(4)} · gone from supply for good` : "Gone from supply for good";
      break;
    }
    case "buy":
      what = `${str(d, "account_id")} bought ${cutText(big(d, "cut_out"))} $CUT for ${nearText(big(d, "near_in"))} NEAR`;
      detail = `1% fee, ${cutText(big(d, "fee"))} $CUT, ${prizeOf(ctx, num(d, "cut_index")).replace(/^To/, "to")}`;
      break;
    case "sell":
      what = `${str(d, "account_id")} sold ${cutText(big(d, "cut_in"))} $CUT for ${nearText(big(d, "near_out"))} NEAR`;
      detail = "Only free $CUT can be sold. Saves stay locked.";
      break;
    case "fee": {
      const source = str(d, "source") === "sell" ? "sell" : "buy";
      const trade = ctx.siblings(group.txHash).find((e) => e.event === source);
      const size = trade ? big(trade.data, source === "sell" ? "cut_in" : "cut_out") : null;
      what = size === null ? `${cutText(big(d, "amount"))} $CUT fee from a ${source}` : `${cutText(big(d, "amount"))} $CUT fee from a ${cutText(size)} $CUT ${source}`;
      detail = prizeOf(ctx, num(d, "cut_index"));
      break;
    }
    case "save": {
      const at = ctx.cutAt(num(d, "cut_index"));
      what = `${str(d, "account_id")} saved ${cutText(big(d, "amount"))} $CUT on ${robot}`;
      detail = `${robot}’s pile: ${cutText(big(d, "pile"))}${at ? ` · locked till ${formatUtcTime(at)} UTC` : ""}`;
      break;
    }
    case "unsave":
      what = `${str(d, "account_id")} took back ${cutText(big(d, "amount"))} $CUT from ${robot}`;
      detail = `With ${cutText(big(d, "prize"))} $CUT of prize · ${robot}’s pile: ${cutText(big(d, "pile"))}`;
      break;
    case "cut":
      cut = cutReceipt(d, ctx.names);
      what = cut.robotName ? `Cut #${cut.index}: ${cut.robotName} is cut` : `Cut #${cut.index}: nobody was cut`;
      detail = cut.robotName
        ? `Half of its ${cutText(cut.pile)} burned; the prize of ${cutText(cut.prize)} went out in ${formatCount(cut.survivors)} equal slices. Run by ${cut.runner}.`
        : `The stage was not full. The prize waits for the next cut. Run by ${cut.runner}.`;
      break;
    case "prize": {
      const burnedSlices = group.entries.filter((e) => e.data.burned === true).length;
      what = n === 1 ? `${robot}’s savers got a slice of ${cutText(big(d, "slice"))} $CUT` : `${formatCount(n)} survivors got a slice of ${cutText(big(d, "slice"))} $CUT`;
      detail = `Each slice is shared by that robot’s savers · ${cutText(big(d, "creator_slice"))} $CUT to each creator`;
      if (burnedSlices > 0) detail += ` · ${formatCount(burnedSlices)} empty ${burnedSlices === 1 ? "pile" : "piles"} burned ${burnedSlices === 1 ? "its slice" : "their slices"}`;
      break;
    }
    case "join":
      if (num(d, "cut_index") === 0 || n > 1) {
        const ids = group.entries.map((e) => name(str(e.data, "robot_id")));
        what = n === 1 ? `${robot} took the stage` : `${formatCount(n)} robots took the stage`;
        detail = n === 1 ? `Its queue of ${cutText(big(d, "pile"))} $CUT became its pile` : `${ids[0]} to ${ids.at(-1)}, each made by the contract`;
      } else {
        what = `${robot} took the empty seat`;
        detail = `Its queue of ${cutText(big(d, "pile"))} $CUT became its pile`;
      }
      break;
    case "register": {
      const deposit = formatAmount(big(d, "deposit"), { decimals: NEAR_DECIMALS, maxFractionDigits: 1 });
      if (n === 1) {
        what = `${str(d, "name") || robot} joined the bench`;
        detail = `${str(d, "account_id")} created by the contract · ${deposit} NEAR deposit`;
      } else {
        what = `${formatCount(n)} robots joined the bench`;
        detail = `${str(d, "account_id")} to ${str(group.entries.at(-1)!.data, "account_id")}, each created by the contract`;
      }
      break;
    }
    case "delete":
      what = `${robot}’s NEAR account was deleted`;
      detail = `${str(d, "account_id")} is gone · its 0.5 NEAR went to ${str(d, "beneficiary")}, who ran the cut`;
      break;
    case "claim":
      what = `${str(d, "account_id")} collected ${cutText(big(d, "amount"))} $CUT in prizes`;
      detail = "Prizes from saves and creator slices";
      break;
  }

  return { key: group.key, tag, label: LABELS[tag], at: group.at, txHash: group.txHash, what, detail, cut };
}

/** "Today 13:41", "Thu Nov 12, 15:01" (UTC), as the journal's "when" column. */
export function whenText(at: Date, now: Date): string {
  const day = relativeUtcDay(now, at);
  if (day === "today") return `Today ${formatUtcTime(at)}`;
  return `${formatUtcDate(at).replace(",", "")}, ${formatUtcTime(at)}`;
}
