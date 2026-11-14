import { describe, expect, it } from "vitest";

import { amountField, journalStats } from "@/entities/journal/model/stats";
import { getJournal, getJournalStats } from "@/entities/journal/server";
import { units } from "@/shared/lib/amount";

describe("journalStats", () => {
  it("adds up the sample day", async () => {
    const stats = await getJournalStats();
    expect(stats).toMatchObject({ minted: units(10_000_000), burned: 0n, cuts: 0, latestBlock: 186_920_114 });
    expect(await getJournalStats("after-cut")).toMatchObject({ burned: units(11_800), cuts: 1 });
    expect(stats.entries).toBe((await getJournal({ limit: 200 })).entries.length);
    expect(stats.firstAt?.toISOString()).toBe("2026-11-12T15:01:00.000Z");
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
