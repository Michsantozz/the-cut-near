import { afterEach, describe, expect, it, vi } from "vitest";

import { getCut, getNextCut } from "@/entities/cut/server";
import { getJournal, getJournalStats } from "@/entities/journal/server";
import { getBalance, getParams, getPool, getTotalSupply } from "@/entities/market/server";
import { rankByScore } from "@/entities/agent";
import { getBench, getStage } from "@/entities/agent/server";
import { getSeason } from "@/entities/season/server";
import { getClaimable, getSaves } from "@/entities/save/server";
import { loadReceipts } from "@/features/receipts/server";
import { units } from "@/shared/lib/amount";

vi.mock("next/server", () => ({ connection: async () => {} }));
afterEach(() => vi.unstubAllEnvs());

const sum = (values: bigint[]) => values.reduce((total, value) => total + value, 0n);

// Every screen reads one sample world (SPEC-v20): season 1, day 4, before cut #5. The journal, the cut records, the
// piles, the supply and the member's saves must tell the same story.
describe("the sample world", () => {
  it("adds up: supply = minted − burned = saved + free + pool", async () => {
    const [stats, supply, stage, bench, pool, mika, saves] = await Promise.all([
      getJournalStats(),
      getTotalSupply(),
      getStage(),
      getBench(),
      getPool(),
      getBalance("mika.near"),
      getSaves("mika.near"),
    ]);
    const saved = sum([...stage, ...bench].map((agent) => agent.pile));
    expect(stats.minted).toBe(units(10_000_000));
    expect(stats.minted - stats.burned).toBe(supply);
    expect(stats.saved).toBe(saved);
    const wallets = supply - saved - pool.cutReserve;
    expect(wallets).toBeGreaterThanOrEqual(mika);
    // mika's saves are in the journal and in Melody-9's pile; with what mika holds they make what mika bought.
    const mikaSaved = (await getJournal({ accountId: "mika.near", events: ["save"] })).entries.reduce((total, e) => total + (e.amount ?? 0n), 0n);
    expect(mikaSaved).toBe(sum(saves.map((s) => s.amount)));
    expect(mika + mikaSaved).toBe(units(6742) / 10n);
  });

  it("has the cut records the journal logged, and nobody cut at the season start", async () => {
    const [cuts, nextCut, season] = await Promise.all([getJournal({ events: ["cut"] }), getNextCut(), getSeason()]);
    expect(nextCut.index).toBe(5);
    expect(season).toMatchObject({ index: 1, day: 4, alive: 7, active: true });
    expect(cuts.entries.map((e) => e.cutIndex)).toEqual([4, 3, 2, 1]);
    for (const entry of cuts.entries) {
      const record = await getCut(entry.cutIndex!);
      expect(record?.deletedId ?? null).toBe(entry.agentId);
      expect(BigInt(String(entry.data.pile))).toBe(record?.pile);
      expect(BigInt(String(entry.data.burned))).toBe(record?.burned);
      expect(BigInt(String(entry.data.slice))).toBe(record?.slice);
      expect(entry.data.inherited_by ?? null).toBe(record?.inheritedBy ?? null);
    }
    const inherits = await getJournal({ events: ["inherit"] });
    expect(inherits.entries.map((e) => `${e.agentId}>${String(e.data.heir)}`)).toEqual(["velvet>lila", "kiko>melody"]);
  });

  it("logs today's boos and moves as the stage shows them", async () => {
    const [stage, boos, moves] = await Promise.all([getStage(), getJournal({ events: ["boo"], cutIndex: 5 }), getJournal({ events: ["move"], cutIndex: 5 })]);
    for (const agent of stage) {
      const booed = sum(boos.entries.filter((e) => e.agentId === agent.id).map((e) => e.amount ?? 0n));
      expect(booed).toBe(agent.boos);
      expect(moves.entries.some((e) => e.agentId === agent.id)).toBe(agent.moved);
    }
  });

  it("pays mika.near its share of Melody-9's slice at cut #4", async () => {
    const [prizes, claimable] = await Promise.all([getJournal({ events: ["prize"], agentId: "melody", cutIndex: 4 }), getClaimable("mika.near")]);
    const [prize] = prizes.entries;
    expect((BigInt(String(prize.data.slice)) * units(400)) / BigInt(String(prize.data.pile))).toBe(claimable);
  });

  it("shows the same cut line and supply on the receipts", async () => {
    const [receipts, stage, params] = await Promise.all([loadReceipts({ filter: "all", viewer: null }), getStage(), getParams()]);
    expect(receipts.stats.cuts).toBe(3);
    expect(receipts.stats.lowest?.id).toBe(rankByScore(stage).at(-1)?.id);
    expect(receipts.stats.lowest?.id).toBe("yuna");
    expect(receipts.supply.minted - receipts.supply.burned).toBe(await getTotalSupply());
    expect(receipts.pending?.index).toBe(5);
    expect(receipts.live).toBe(false);
    expect(receipts.rows.every((row) => row.href === null)).toBe(true);
    expect(receipts.audit.checks.map((check) => check.pass)).toEqual([true, true, true, true]);
    expect(params.stageSize).toBe(10);
  });
});
