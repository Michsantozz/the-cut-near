import { afterEach, describe, expect, it, vi } from "vitest";

import { getCut, getNextCut } from "@/entities/cut/server";
import { paysPer100, sliceIfCut } from "@/entities/cut";
import { getJournal, getJournalStats } from "@/entities/journal/server";
import { getBalance, getParams, getPool, getTotalSupply } from "@/entities/market/server";
import { rankByPile } from "@/entities/robot";
import { getBench, getStage } from "@/entities/robot/server";
import { getSaves } from "@/entities/save/server";
import { loadLineup } from "@/features/lineup/server";
import { loadReceipts } from "@/features/receipts/server";
import { loadRobotProfile } from "@/features/robot-profile/server";
import { units } from "@/shared/lib/amount";

vi.mock("next/server", () => ({ connection: async () => {} }));
afterEach(() => vi.unstubAllEnvs());

const sum = (values: bigint[]) => values.reduce((total, value) => total + value, 0n);

// Every screen reads one sample world (docs/design/SPEC-v19.md §2): day 2 at 13:48, before cut #1. Only the
// after-cut screens see cut #1, and the world after it adds up too.
describe("the sample world", () => {
  it("adds up before the cut: supply = minted − burned = saved + free + pool", async () => {
    const [stats, supply, stage, bench, pool, mika, saves] = await Promise.all([
      getJournalStats(),
      getTotalSupply(),
      getStage(),
      getBench(),
      getPool(),
      getBalance("mika.near"),
      getSaves("mika.near"),
    ]);
    const saved = sum([...stage, ...bench].map((robot) => robot.pile));
    expect(stats.minted).toBe(units(10_000_000));
    expect(stats.burned).toBe(0n);
    expect(stats.cuts).toBe(0);
    expect(stats.minted - stats.burned).toBe(supply);
    expect(stats.saved).toBe(saved);
    // What is neither burned nor saved is free: the pool's reserve plus every wallet, mika's 274.2 among them.
    const wallets = supply - saved - pool.cutReserve;
    expect(wallets).toBeGreaterThanOrEqual(mika);
    expect(saved + pool.cutReserve + wallets).toBe(stats.minted - stats.burned);
    // mika's saves are in the journal and in Melody-9's pile.
    const mikaSaved = (await getJournal({ accountId: "mika.near", events: ["save"] })).entries.reduce((total, e) => total + (e.amount ?? 0n), 0n);
    expect(mikaSaved).toBe(sum(saves.map((s) => s.amount)));
    expect(mika + mikaSaved).toBe(units(6742) / 10n);
  });

  it("is still before cut #1: its receipt is not in the journal yet", async () => {
    const [nextCut, stage] = await Promise.all([getNextCut(), getStage()]);
    expect(nextCut.index).toBe(1);
    expect(rankByPile(stage).at(-1)?.id).toBe(nextCut.lowestId);
    expect((await getJournal({ events: ["cut", "delete", "ft_burn", "prize"] })).entries).toEqual([]);
  });

  it("adds up after the cut on the after-cut screens", async () => {
    const [stats, cut, params] = await Promise.all([getJournalStats("after-cut"), getCut(1), getParams()]);
    expect(cut?.deletedId).toBe("kiko");
    expect(stats.cuts).toBe(1);
    expect(stats.burned).toBe(cut?.burned);
    expect(stats.minted - stats.burned).toBe(units(9_988_200));
    const stage = (await getStage()).filter((robot) => robot.id !== "kiko");
    const bench = await getBench();
    expect(stats.saved).toBe(sum([...stage, ...bench].map((robot) => robot.pile)));
    // The cut's slice is the shared prize math on its own numbers (23,600 cut with the day's 5,020 in fees),
    // rounded to 0.1 $CUT like the design's 1,775.4.
    const tenth = units(1) / 10n;
    expect(sliceIfCut(cut!.pile, units(5_020), params) / tenth).toBe(cut!.slice / tenth);
    const prizes = await getJournal({ events: ["prize"], sampleMoment: "after-cut" });
    expect(prizes.entries).toHaveLength(params.stageSize - 1);
  });

  it("shows the same stage, rank and pays per 100 on the lineup, the robot page and the receipts", async () => {
    const [lineup, pixie, receipts, nextCut, params, stage] = await Promise.all([
      loadLineup(null),
      loadRobotProfile("pixie", null),
      loadReceipts({ filter: "all", viewer: null }),
      getNextCut(),
      getParams(),
      getStage(),
    ]);
    const lowest = rankByPile(stage).at(-1)!;
    const slice = sliceIfCut(lowest.pile, nextCut.prizeSoFar, params);
    const pixiePays = paysPer100(slice, units(182_400));

    expect(lineup.board.entries).toHaveLength(10);
    expect(lineup.board.lowest?.id).toBe("kiko");
    const onLineup = lineup.board.entries.find((entry) => entry.robot.id === "pixie");
    expect(onLineup?.rank).toBe(1);
    expect(onLineup?.paysPer100).toBe(pixiePays);

    expect(pixie?.standing).toEqual({ place: "stage", rank: 1, of: 10, isLowest: false, isSecondLowest: false });
    expect(pixie?.pays?.per100).toBe(pixiePays);
    expect(pixie?.ladder.filter((row) => !row.bench)).toHaveLength(10);

    expect(receipts.stats.cuts).toBe(0);
    expect(receipts.stats.lowest?.id).toBe("kiko");
    expect(receipts.supply.burned).toBe(0n);
    expect(receipts.pending?.index).toBe(1);
    expect(receipts.audit.checks.map((check) => check.pass)).toEqual([true, true, true, true, true]);
  });
});
