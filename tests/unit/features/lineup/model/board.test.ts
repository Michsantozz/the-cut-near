import { afterEach, describe, expect, it, vi } from "vitest";

import { gapShown, gapToPass, rankByScore, tenthsToPass, type Agent } from "@/entities/agent";
import { getStage } from "@/entities/agent/server";
import { getNextCut } from "@/entities/cut/server";
import { getMoves } from "@/entities/move/server";
import { buildBoard, seasonStartCut } from "@/features/lineup/model/board";
import { loadLineup } from "@/features/lineup/server";
import { units } from "@/shared/lib/amount";

vi.mock("next/server", () => ({ connection: async () => {} }));
afterEach(() => vi.unstubAllEnvs());

const agent = (id: string, pile: number, boos = 0, damage = 0, joined = "2026-11-09T12:00:00Z"): Agent => ({
  id,
  accountId: `${id}.thecut.sample`,
  name: id,
  tagline: "",
  personality: "miser",
  charter: "",
  xHandle: "",
  creator: "c.sample",
  status: "stage",
  pile: units(pile),
  savers: 1,
  savedToday: 0n,
  joinedAt: new Date(joined),
  wallet: 0n,
  heir: null,
  pacts: [],
  boos: units(boos),
  damage: units(damage),
  bounty: 0n,
  score: units(pile - boos - damage),
  moved: false,
});

describe("the stage board", () => {
  it("ranks by score, not by pile: boos and damage push an agent down", () => {
    const board = buildBoard([agent("big", 1_000, 900), agent("mid", 500), agent("small", 300, 0, 0)], []);
    expect(board.entries.map((entry) => entry.agent.id)).toEqual(["mid", "small", "big"]);
    expect(board.lowest?.id).toBe("big");
    expect(board.next?.id).toBe("small");
    // Same age counts as newer: a tie is never sold as a pass.
    expect(board.gap).toBe(units(200) + 1n);
  });

  it("cuts the newer agent on a tied score, so the newer one needs one unit more to pass", () => {
    const older = agent("older", 500, 0, 0, "2026-11-09T12:00:00Z");
    const newer = agent("newer", 500, 0, 0, "2026-11-09T13:00:00Z");
    expect(rankByScore([newer, older]).map((a) => a.id)).toEqual(["older", "newer"]);
    expect(gapToPass(newer, older)).toBe(1n);
    expect(gapToPass(older, newer)).toBe(0n);
  });

  it("shows a gap rounded up to 0.1 $CUT, so the number shown is always enough to pass", () => {
    const tenth = units(1) / 10n;
    expect(tenthsToPass(units(191) + 4n * tenth + 1n)).toBe(units(191) + 5n * tenth);
    expect(tenthsToPass(units(600) + 1n)).toBe(units(600) + tenth);
    expect(tenthsToPass(units(600))).toBe(units(600));
    expect(tenthsToPass(0n)).toBe(0n);
  });

  it("shows the gap the two scores on screen need: Kiko 959.5 is 191.5 from passing Onyx 1,150.9, as on chain", () => {
    const tenth = units(1) / 10n;
    const kiko = { score: units(959) + 5n * tenth, joinedAt: new Date("2026-11-09T13:00:00Z") };
    const onyx = { score: units(1_150) + 9n * tenth, joinedAt: new Date("2026-11-09T12:00:00Z") };
    expect(gapToPass(kiko, onyx)).toBe(units(191) + 4n * tenth + 1n);
    expect(gapShown(kiko, onyx)).toBe(units(191) + 5n * tenth);
    // An older agent wins a tie, so the plain difference is enough.
    expect(gapShown({ ...kiko, joinedAt: new Date("2026-11-09T11:00:00Z") }, onyx)).toBe(units(191) + 4n * tenth);
  });

  it("never shows a gap the scores on screen contradict, even with digits past the first decimal", () => {
    const tenth = units(1) / 10n;
    // 959.59 shows as 959.5 and 1,150.91 as 1,150.9: the real gap rounds up to 191.4, but 959.5 + 191.4 only ties.
    const low = { score: units(959) + 59n * (tenth / 10n), joinedAt: new Date("2026-11-09T13:00:00Z") };
    const high = { score: units(1_150) + 91n * (tenth / 10n), joinedAt: new Date("2026-11-09T12:00:00Z") };
    expect(tenthsToPass(gapToPass(low, high))).toBe(units(191) + 4n * tenth);
    expect(gapShown(low, high)).toBe(units(191) + 5n * tenth);
  });

  it("puts each agent's move next to it", async () => {
    const [stage, nextCut] = await Promise.all([getStage(), getNextCut()]);
    const board = buildBoard(stage, await getMoves(nextCut.index));
    expect(board.entries.find((entry) => entry.agent.id === "lila")?.move?.move).toBe("attack");
    expect(board.entries.find((entry) => entry.agent.id === "pixie")?.move).toBeNull();
  });

  it("counts season days from the cut that started the season", () => {
    expect(seasonStartCut(5, 4)).toBe(1);
  });
});

describe("the sample lineup (v20 sample world, season 1, day 4)", () => {
  it("has seven agents alive, Yuna on the cut line, three cut with their wallets' fate", async () => {
    vi.stubEnv("DATA_SOURCE", "");
    const lineup = await loadLineup(null);
    expect(lineup.sample).toBe(true);
    expect(lineup.season).toMatchObject({ index: 1, day: 4, alive: 7, active: true });
    expect(lineup.board.entries).toHaveLength(7);
    expect(lineup.board.lowest?.id).toBe("yuna");
    expect(lineup.board.next?.id).toBe("gremlin");
    expect(lineup.board.gap).toBe(units(600) + 1n);
    expect(lineup.movesCloseAt.getTime()).toBe(lineup.cutAt.getTime() - 3_600_000);
    expect(lineup.cutThisSeason.map((entry) => [entry.day, entry.agent.id, entry.heir?.id ?? null])).toEqual([
      [3, "velvet", "lila"],
      [2, "onyx", null],
      [1, "kiko", "melody"],
    ]);
    // Every personality is on the stage or was, and the moves include a betrayal, a rescue, a pact, an attack and a hold.
    const moves = lineup.board.entries.flatMap((entry) => (entry.move ? [entry.move] : []));
    expect(new Set(moves.map((move) => move.move))).toEqual(new Set(["attack", "rescue", "pact", "hold"]));
    const betrayal = moves.find((move) => move.agentId === "lila");
    expect(betrayal?.target).toBe("yuna");
    expect(lineup.board.entries.find((entry) => entry.agent.id === "lila")?.agent.pacts).toContain("yuna");
  });
});
