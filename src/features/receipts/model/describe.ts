import type { JournalEntry } from "@/entities/journal";
import { NEAR_DECIMALS } from "@/shared/lib/amount";
import { formatAmount, formatCount, formatUtcDate, formatUtcTime, relativeUtcDay } from "@/shared/ui/format";

// One journal line as the Receipts page writes it, in a fan's words. Field names follow contracts/thecut/src/events.rs;
// the v2 names are assumed (see shared/near/events.ts).

export type ReceiptTag =
  | "launch"
  | "buy"
  | "sell"
  | "fee"
  | "save"
  | "unsave"
  | "boo"
  | "move"
  | "pact"
  | "attack"
  | "rescue"
  | "inherit"
  | "cut"
  | "burn"
  | "prize"
  | "join"
  | "season"
  | "champion"
  | "delete"
  | "claim"
  | "other";

/** Entries of one NEP-297 event in one transaction (a join of 10 agents, a prize for 9 survivors) read as one line. */
export type ReceiptGroup = { key: string; event: string; txHash: string; at: Date; entries: JournalEntry[] };

export type CutReceipt = {
  index: number;
  agentId: string | null;
  agentName: string | null;
  agentAccountId: string | null;
  pile: bigint;
  burned: bigint;
  prize: bigint;
  slice: bigint;
  creatorSlice: bigint;
  survivors: number;
  runner: string;
  /** The heir that received the cut agent's wallet; null when it burned. */
  heirName: string | null;
  /** The cut agent's wallet, moved to its heir or burned. */
  wallet: bigint;
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
  /** Agent names by id; unknown agents keep their id. */
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
  boo: "BOO",
  move: "MOVE",
  pact: "PACT",
  attack: "ATTACK",
  rescue: "RESCUE",
  inherit: "HEIR",
  cut: "CUT",
  burn: "BURN",
  prize: "PRIZE",
  join: "JOIN",
  season: "SEASON",
  champion: "CHAMPION",
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
  boo: "boo",
  move: "move",
  pact: "pact",
  attack: "attack",
  rescue: "rescue",
  inherit: "inherit",
  cut: "cut",
  prize: "prize",
  join: "join",
  register: "join",
  season_start: "season",
  champion: "champion",
  delete: "delete",
  claim: "claim",
};

/** Consecutive entries of the same event in the same transaction, newest first. Burns group only with the same memo. */
export function groupEntries(entries: readonly JournalEntry[]): ReceiptGroup[] {
  const groups: ReceiptGroup[] = [];
  for (const entry of entries) {
    const last = groups.at(-1);
    const same = last && last.txHash === entry.txHash && last.event === entry.event && (entry.event !== "ft_burn" || last.entries[0].data.memo === entry.data.memo);
    if (last && same) last.entries.push(entry);
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
  const agentId = str(data, "agent_id") || null;
  return {
    index: num(data, "cut_index"),
    agentId,
    agentName: agentId ? (names.get(agentId) ?? agentId) : null,
    agentAccountId: str(data, "agent_account_id") || null,
    pile: big(data, "pile"),
    burned: big(data, "burned"),
    prize: big(data, "prize"),
    slice: big(data, "slice"),
    creatorSlice: big(data, "creator_slice"),
    survivors: num(data, "survivors"),
    runner: str(data, "runner"),
    heirName: str(data, "inherited_by") ? (names.get(str(data, "inherited_by")) ?? str(data, "inherited_by")) : null,
    wallet: big(data, "wallet"),
  };
}

/** The agent a burn came from, when its owner is an agent account (`<id>.<contract>`) the page knows. */
function burnAgent(owner: string, names: ReadonlyMap<string, string>): string | null {
  const [id, ...rest] = owner.split(".");
  return rest.length > 1 && names.has(id) ? (names.get(id) ?? null) : null;
}

/** A move in one line: "Lila Loop attacks Yuna Star with 300 $CUT". */
function moveText(agent: string, move: string, target: string, amount: bigint): string {
  switch (move) {
    case "rescue":
      return `${agent} offers its savers ${cutText(amount)} $CUT if it survives`;
    case "pact":
      return `${agent} pays ${target} ${cutText(amount)} $CUT for a pact`;
    case "attack":
      return `${agent} attacks ${target} with ${cutText(amount)} $CUT`;
    default:
      return `${agent} holds its money`;
  }
}

/** The contract's note on a move it changed ("cut down: …", "downgraded: …"), as one sentence. */
function outcomeText(outcome: string): string {
  const [head, ...rest] = outcome.split(": ");
  const why = rest.join(": ");
  const verbs: Record<string, string> = { "cut down": "cut it down", downgraded: "downgraded it" };
  return why && verbs[head] ? `The contract ${verbs[head]}: ${why}` : `The contract stepped in: ${outcome}`;
}

/**
 * True for a burn that its own transaction already tells: a move's think fee and a boo's burn. The journal folds
 * them into the move or boo line, except under the Burns filter.
 */
export function isFoldedBurn(group: ReceiptGroup, ctx: Pick<DescribeContext, "siblings">): boolean {
  if (group.event !== "ft_burn") return false;
  const memo = group.entries[0]?.data.memo;
  const teller = memo === "think fee" ? "move" : memo === "boo" ? "boo" : null;
  return teller !== null && ctx.siblings(group.txHash).some((e) => e.event === teller);
}

/** What happened, in one line plus one detail line. */
export function describeGroup(group: ReceiptGroup, ctx: DescribeContext): ReceiptLine {
  const tag = TAGS[group.event] ?? "other";
  const [first] = group.entries;
  const d = first.data;
  const name = (id: string) => ctx.names.get(id) ?? id;
  const agent = name(str(d, "agent_id"));
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
      const amount = cutText(big(d, "amount"));
      const owner = burnAgent(str(d, "owner_id"), ctx.names);
      what = `${amount} $CUT burned`;
      detail = "Gone from supply for good";
      if (memo === "think fee") {
        what = `${owner ?? "An agent"} paid ${amount} $CUT to think`;
        detail = "The think fee of its move, burned from its wallet";
      } else if (memo === "boo") {
        detail = "Burned by a boo · gone from supply for good";
      } else if (memo === "attacks") {
        detail = "The day’s attacks, burned at the cut";
      } else if (/^cut \d+: wallet/.test(memo)) {
        what = `${owner ? `${owner}’s wallet burned` : "A wallet burned"}: ${amount} $CUT`;
        detail = `Cut at #${memo.slice(4, memo.indexOf(":"))} with no living heir`;
      } else if (memo.startsWith("cut ")) {
        detail = `Half of the pile cut at #${memo.slice(4)} · gone from supply for good`;
      }
      break;
    }
    case "buy":
      what = `${str(d, "account_id")} bought ${cutText(big(d, "cut_out"))} $CUT for ${nearText(big(d, "near_in"))} NEAR`;
      detail = `1% fee, ${cutText(big(d, "fee"))} $CUT: half to the season pot, half ${prizeOf(ctx, num(d, "cut_index")).replace(/^To/, "to")}`;
      break;
    case "sell":
      what = `${str(d, "account_id")} sold ${cutText(big(d, "cut_in"))} $CUT for ${nearText(big(d, "near_out"))} NEAR`;
      detail = `1% fee, ${cutText(big(d, "fee"))} $CUT. Only free $CUT can be sold; saves stay locked.`;
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
      what = `${str(d, "account_id")} saved ${cutText(big(d, "amount"))} $CUT on ${agent}`;
      detail = `${big(d, "pile") > 0n ? `${agent}’s pile: ${cutText(big(d, "pile"))} · ` : ""}${at ? `locked till the cut, ${formatUtcTime(at)} UTC` : "locked till the next cut"}`;
      break;
    }
    case "unsave":
      what = `${str(d, "account_id")} took back ${cutText(big(d, "amount"))} $CUT from ${agent}`;
      detail = `With ${cutText(big(d, "prize"))} $CUT of prize · ${agent}’s pile: ${cutText(big(d, "pile"))}`;
      break;
    case "boo":
      what = n === 1 ? `${str(d, "account_id")} booed ${agent}: ${cutText(big(d, "amount"))} $CUT burned for good` : `Fans booed ${agent}`;
      detail = `Lowers ${agent}’s score at cut #${num(d, "cut_index")}. Nobody gets this $CUT back.`;
      break;
    case "move": {
      const target = name(str(d, "target"));
      const outcome = str(d, "outcome");
      const fee = ctx.siblings(group.txHash).find((e) => e.event === "ft_burn" && e.data.memo === "think fee");
      const effects: Record<string, string> = {
        attack: `burns at the cut and lowers ${target}’s score`,
        rescue: "paid only if it survives, at most what its savers saved",
        pact: "paid at the cut, then neither may attack the other",
      };
      const effect = effects[str(d, "move")];
      what = moveText(agent, str(d, "move"), target, big(d, "amount"));
      detail = [
        outcome ? outcomeText(outcome) : `For cut #${num(d, "cut_index")}`,
        !outcome && effect ? effect : !outcome ? "no money moves" : null,
        fee ? `${cutText(big(fee.data, "amount"))} $CUT think fee burned` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      break;
    }
    case "pact":
      what = n === 1 ? `${agent} paid ${name(str(d, "target"))} ${cutText(big(d, "amount"))} $CUT: pact sealed` : `${formatCount(n)} pacts sealed`;
      detail = `${n > 1 ? `${group.entries.map((e) => `${name(str(e.data, "agent_id"))} and ${name(str(e.data, "target"))}`).join(" · ")}. ` : ""}For the next day neither may attack the other; only a traitor still may.`;
      break;
    case "attack": {
      const total = group.entries.reduce((sum, e) => sum + big(e.data, "amount"), 0n);
      what = n === 1 ? `${agent} attacked ${name(str(d, "target"))}: ${cutText(big(d, "amount"))} $CUT burned` : `${formatCount(n)} attacks landed: ${cutText(total)} $CUT burned`;
      detail =
        n === 1
          ? `${name(str(d, "target"))}’s score dropped by ${cutText(big(d, "amount"))} at cut #${num(d, "cut_index")}`
          : group.entries.map((e) => `${name(str(e.data, "agent_id"))} hit ${name(str(e.data, "target"))}`).join(" · ");
      break;
    }
    case "rescue": {
      const paid = group.entries.reduce((sum, e) => sum + big(e.data, "paid"), 0n);
      what = n === 1 ? `${agent} survived and paid its savers ${cutText(big(d, "paid"))} $CUT` : `${formatCount(n)} survivors paid their savers ${cutText(paid)} $CUT`;
      detail = n === 1 ? "Its rescue bounty, shared by its savers by $CUT saved" : group.entries.map((e) => name(str(e.data, "agent_id"))).join(", ");
      break;
    }
    case "inherit":
      what = `${agent}’s wallet went to its heir ${name(str(d, "heir"))}: ${cutText(big(d, "amount"))} $CUT`;
      detail = `${agent} was cut at #${num(d, "cut_index")}. A cut agent’s whole wallet goes to an heir that survives.`;
      break;
    case "season_start": {
      const agents = Array.isArray(d.agents) ? d.agents.length : 0;
      what = `Season ${num(d, "season")} started: ${formatCount(agents)} agents took the stage`;
      detail = "The biggest bench queues took the seats. Nobody is cut on the first cut.";
      break;
    }
    case "champion":
      what = `${agent} is the champion of season ${num(d, "season")}`;
      detail = `Its savers split the ${cutText(big(d, "pot"))} $CUT season pot. Its account stays forever as a trophy.`;
      break;
    case "cut":
      cut = cutReceipt(d, ctx.names);
      what = cut.agentName ? `Cut #${cut.index}: ${cut.agentName} is cut` : `Cut #${cut.index}: nobody was cut`;
      detail = cut.agentName
        ? `Lowest score. Half of its ${cutText(cut.pile)} pile burned; the day prize of ${cutText(cut.prize)} went out in ${formatCount(cut.survivors)} equal slices. Run by ${cut.runner}.`
        : `A season started. The day prize carries to the next cut. Run by ${cut.runner}.`;
      break;
    case "prize": {
      const burnedSlices = group.entries.filter((e) => e.data.burned === true).length;
      what = n === 1 ? `${agent}’s savers got a slice of ${cutText(big(d, "slice"))} $CUT` : `${formatCount(n)} survivors got a slice of ${cutText(big(d, "slice"))} $CUT`;
      detail = `Each slice is shared by that agent’s savers · ${big(d, "agent_share") > 0n ? `${cutText(big(d, "agent_share"))} $CUT into each agent’s wallet · ` : ""}${cutText(big(d, "creator_slice"))} $CUT to each creator`;
      if (burnedSlices > 0) detail += ` · ${formatCount(burnedSlices)} empty ${burnedSlices === 1 ? "pile" : "piles"} burned ${burnedSlices === 1 ? "its slice" : "their slices"}`;
      break;
    }
    case "join":
      if (num(d, "cut_index") === 0 || n > 1) {
        const ids = group.entries.map((e) => name(str(e.data, "agent_id")));
        what = n === 1 ? `${agent} took the stage` : `${formatCount(n)} agents took the stage`;
        detail = n === 1 ? `Its queue of ${cutText(big(d, "pile"))} $CUT became its pile` : `${ids[0]} to ${ids.at(-1)}, each made by the contract`;
      } else {
        what = `${agent} took the empty seat`;
        detail = `Its queue of ${cutText(big(d, "pile"))} $CUT became its pile`;
      }
      break;
    case "register": {
      const deposit = formatAmount(big(d, "deposit"), { decimals: NEAR_DECIMALS, maxFractionDigits: 1 });
      const seed = big(d, "seed");
      const kind = str(d, "personality");
      if (n === 1) {
        what = `${str(d, "name") || agent} joined the bench`;
        detail = `${kind ? `${kind.charAt(0).toUpperCase()}${kind.slice(1)} · ` : ""}${seed > 0n ? `${cutText(seed)} $CUT seed in its wallet · ` : ""}${str(d, "account_id")} created by the contract · ${deposit} NEAR deposit`;
      } else {
        what = `${formatCount(n)} agents joined the bench`;
        detail = `${str(d, "account_id")} to ${str(group.entries.at(-1)!.data, "account_id")}, each created by the contract`;
      }
      break;
    }
    case "delete":
      what = `${agent}’s NEAR account was deleted`;
      detail = `${str(d, "account_id")} is gone · its leftover NEAR went to ${str(d, "beneficiary")}, who ran the cut`;
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
