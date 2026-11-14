import type { JournalEntry, JournalStats } from "./types";

/** An item field holding a U128 decimal string, as a bigint; 0 when missing or malformed. */
export function amountField(data: Record<string, unknown>, key: string): bigint {
  const value = data[key];
  return typeof value === "string" && /^(0|[1-9]\d{0,38})$/.test(value) ? BigInt(value) : 0n;
}

/** The same totals the live query computes, over entries in memory (sample mode and tests). */
export function journalStats(entries: readonly JournalEntry[]): JournalStats {
  let minted = 0n;
  let burned = 0n;
  let saved = 0n;
  let cuts = 0;
  const buyers = new Set<string>();
  const registered = new Set<string>();
  for (const e of entries) {
    if (e.event === "ft_mint") minted += amountField(e.data, "amount");
    else if (e.event === "ft_burn") burned += amountField(e.data, "amount");
    else if (e.event === "save") saved += amountField(e.data, "amount");
    else if (e.event === "unsave") saved -= amountField(e.data, "amount");
    else if (e.event === "cut") {
      cuts += 1;
      saved -= amountField(e.data, "pile");
    } else if (e.event === "buy" && e.accountId) buyers.add(e.accountId);
    else if (e.event === "register" && e.agentId) registered.add(e.agentId);
  }
  const heights = entries.map((e) => e.blockHeight);
  const times = entries.map((e) => e.at.getTime());
  return {
    entries: entries.length,
    firstAt: times.length ? new Date(Math.min(...times)) : null,
    latestBlock: heights.length ? Math.max(...heights) : null,
    minted,
    burned,
    saved,
    cuts,
    buyers: buyers.size,
    registered: [...registered].sort(),
  };
}
