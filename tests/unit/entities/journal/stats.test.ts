import { describe, expect, it } from "vitest";

import { amountField, journalStats } from "@/entities/journal/model/stats";
import { getJournal, getJournalStats } from "@/entities/journal/server";
import { sampleHoursBeforeCut } from "@/shared/config/sample";
import { units } from "@/shared/lib/amount";

describe("journalStats", () => {
  it("adds up the sample world: season 1, day 4", async () => {
    const stats = await getJournalStats();
    // Burned so far: three half piles, the day's attacks, think fees, boos and Onyx's heirless wallet.
    const burned = 3_050 + 4_450 + 5_700 + 2_600 + 30 * 10 + 4_500 + 2_310;
    expect(stats).toMatchObject({ minted: units(10_000_000), burned: units(burned), cuts: 4, latestBlock: 186_920_114 });
    let entries = 0;
    for (let page = await getJournal({ limit: 200 }); ; page = await getJournal({ limit: 200, before: page.next! })) {
      entries += page.entries.length;
      if (!page.next) break;
    }
    expect(stats.entries).toBe(entries);
    // Launch was 50 hours before cut #1, four days before today's cut.
    expect(stats.firstAt).toEqual(sampleHoursBeforeCut(4 * 24 + 50));
    expect(stats.buyers).toBeGreaterThan(0);
    expect(stats.registered.length).toBe(13);
  });

  it("is empty for no entries and ignores bad amounts", () => {
    expect(journalStats([])).toMatchObject({ entries: 0, firstAt: null, latestBlock: null, minted: 0n, cuts: 0 });
    expect(amountField({ amount: "12" }, "amount")).toBe(12n);
    expect(amountField({ amount: 12 }, "amount")).toBe(0n);
    expect(amountField({ amount: "1e5" }, "amount")).toBe(0n);
  });
});

describe("sample journal pages", () => {
  it("pages newest first by block height", async () => {
    const first = await getJournal({ limit: 5 });
    expect(first.entries).toHaveLength(5);
    expect(first.next).not.toBeNull();
    const second = await getJournal({ limit: 5, before: first.next! });
    expect(second.entries[0].blockHeight).toBeLessThan(first.entries.at(-1)!.blockHeight);
  });
});
