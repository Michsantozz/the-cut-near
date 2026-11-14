import { afterEach, describe, expect, it, vi } from "vitest";

import { gapToPass, rankByScore, type Agent } from "@/entities/agent";
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
    expect(board.gap).toBe(units(201));
  });

  it("cuts the newer agent on a tied score, so the newer one needs one $CUT more to pass", () => {
    const older = agent("older", 500, 0, 0, "2026-11-09T12:00:00Z");
    const newer = agent("newer", 500, 0, 0, "2026-11-09T13:00:00Z");
    expect(rankByScore([newer, older]).map((a) => a.id)).toEqual(["older", "newer"]);
    expect(gapToPass(newer, older)).toBe(units(1));
    expect(gapToPass(older, newer)).toBe(0n);
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

describe("the sample lineup (SPEC-v20 season 1, day 4)", () => {
  it("has seven agents alive, Yuna on the cut line, three cut with their wallets' fate", async () => {
    vi.stubEnv("DATA_SOURCE", "");
    const lineup = await loadLineup(null);
    expect(lineup.sample).toBe(true);
    expect(lineup.season).toMatchObject({ index: 1, day: 4, alive: 7, active: true });
    expect(lineup.board.entries).toHaveLength(7);
    expect(lineup.board.lowest?.id).toBe("yuna");
    expect(lineup.board.next?.id).toBe("gremlin");
    expect(lineup.board.gap).toBe(units(601));
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
