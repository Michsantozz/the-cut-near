import { describe, expect, it } from "vitest";

import { paysPer100, sliceIfCut } from "@/entities/cut";
import { getNextCut } from "@/entities/cut/server";
import { getParams } from "@/entities/market/server";
import { compareAgents, rankByPile, type Agent } from "@/entities/agent";
import { getBench, getStage } from "@/entities/agent/server";
import {
  barPercent,
  boardOrder,
  boardOrders,
  buildBoard,
  dayOfCut,
  gapToPass,
  rankBench,
} from "@/features/lineup/model/board";
import { units } from "@/shared/lib/amount";
import { formatAmount } from "@/shared/ui/format";

const LAUNCH = new Date("2026-11-12T15:01:00Z");
const LATER = new Date("2026-11-12T16:12:00Z");

const agent = (id: string, pile: number, joinedAt = LAUNCH, extra: Partial<Agent> = {}): Agent => ({
  id,
  accountId: `${id}.thecut.near`,
  name: id,
  kind: "AI agent",
  xHandle: `@${id}`,
  creator: `${id}-studio.near`,
  status: "stage",
  pile: units(pile),
  savers: 0,
  savedToday: 0n,
  joinedAt,
  ...extra,
});

const params = { burnBps: 5_000, saversBps: 9_500, stageSize: 10 };
const pays = (value: bigint | null) => (value === null ? null : formatAmount(value, { maxFractionDigits: 2, minFractionDigits: 2 }));

describe("ranking", () => {
  it("puts the higher pile first", () => {
    expect(rankByPile([agent("a", 10), agent("b", 30), agent("c", 20)]).map((r) => r.id)).toEqual(["b", "c", "a"]);
  });

  it("ranks the newer agent lower on a tie, because the newer one is cut", () => {
    const older = agent("zed", 50, LAUNCH);
    const newer = agent("abe", 50, LATER);
    expect(rankByPile([newer, older]).map((r) => r.id)).toEqual(["zed", "abe"]);
    expect(compareAgents(newer, older)).toBeGreaterThan(0);
  });

  it("keeps a stable order for a full tie", () => {
    expect(rankByPile([agent("b", 5), agent("a", 5)]).map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("does not mutate its input", () => {
    const stage = [agent("a", 1), agent("b", 2)];
    rankByPile(stage);
    expect(stage.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("ranks the sample stage like the design, Kiko Bun last", async () => {
    const ranked = rankByPile(await getStage());
    expect(ranked.map((r) => r.id)).toEqual(["pixie", "lila", "oracle", "mabel", "melody", "yuna", "gremlin", "velvet", "onyx", "kiko"]);
  });

  it("ranks the bench by queue", async () => {
    expect(rankBench(await getBench()).map((r) => r.id)).toEqual(["chartwise", "bloop", "pixelkit"]);
  });
});

describe("gap to pass", () => {
  it("needs one more than the difference when the agents are the same age", () => {
    expect(gapToPass(agent("kiko", 23_600), agent("onyx", 61_800))).toBe(units(38_201));
  });

  it("needs one more than the difference when the agent is newer", () => {
    expect(gapToPass(agent("new", 10, LATER), agent("old", 15, LAUNCH))).toBe(units(6));
    expect(gapToPass(agent("new", 15, LATER), agent("old", 15, LAUNCH))).toBe(units(1));
  });

  it("needs only the difference when the agent is older, since it wins the tie", () => {
    expect(gapToPass(agent("old", 10, LAUNCH), agent("new", 15, LATER))).toBe(units(5));
    expect(gapToPass(agent("old", 15, LAUNCH), agent("new", 15, LATER))).toBe(0n);
  });

  it("is zero when the agent is already above", () => {
    expect(gapToPass(agent("a", 20), agent("b", 15))).toBe(0n);
  });

  it("matches the contract's gap on the sample day", async () => {
    const board = buildBoard(await getStage(), (await getNextCut()).prizeSoFar, await getParams());
    expect(board.lowest?.id).toBe("kiko");
    expect(board.next?.id).toBe("onyx");
    expect(board.gap).toBe((await getNextCut()).gapToNext);
  });
});

describe("slice and pays per 100 saved", () => {
  it("is (lowest pile ÷ 2 + fees) × 95% ÷ 9 survivors", () => {
    // The design's sample cut: (11,800 + 5,020) × 0.95 ÷ 9 = 1,775.44
    expect(formatAmount(sliceIfCut(units(23_600), units(5_020), params), { maxFractionDigits: 1 })).toBe("1,775.4");
  });

  it("uses the fees so far, so the numbers are 'if the cut ran now'", () => {
    // (11,800 + 4,100) × 0.95 ÷ 9 = 1,678.33
    expect(formatAmount(sliceIfCut(units(23_600), units(4_100), params))).toBe("1,678.33");
  });

  it("follows the burn share instead of assuming half", () => {
    const quarterBurn = sliceIfCut(units(1_000), 0n, { burnBps: 2_500, saversBps: 10_000, stageSize: 4 });
    expect(quarterBurn).toBe(units(250));
  });

  it("is zero without survivors", () => {
    expect(sliceIfCut(units(100), units(100), { ...params, stageSize: 1 })).toBe(0n);
  });

  it("pays slice ÷ pile × 100", () => {
    const slice = sliceIfCut(units(23_600), units(5_020), params);
    // The design's table (SPEC-v19 §2), which assumed 5,020 in fees.
    expect(pays(paysPer100(slice, units(182_400)))).toBe("0.97");
    expect(pays(paysPer100(slice, units(112_300)))).toBe("1.58");
    expect(pays(paysPer100(slice, units(61_800)))).toBe("2.87");
  });

  it("pays nothing on an empty pile: its slice burns", () => {
    expect(paysPer100(units(10), 0n)).toBeNull();
  });
});

describe("board", () => {
  it("marks the lowest agent as cut and prices every survivor with the fees so far", async () => {
    const board = buildBoard(await getStage(), (await getNextCut()).prizeSoFar, await getParams());
    const byId = new Map(board.entries.map((entry) => [entry.agent.id, entry]));
    expect(byId.get("kiko")?.isLowest).toBe(true);
    expect(byId.get("kiko")?.paysPer100).toBeNull();
    expect(pays(byId.get("pixie")?.paysPer100 ?? null)).toBe("0.92");
    expect(pays(byId.get("onyx")?.paysPer100 ?? null)).toBe("2.72");
    expect(board.totalSaved).toBe(units(1_052_400));
    expect(board.topPile).toBe(units(182_400));
  });

  it("handles an empty stage", () => {
    const board = buildBoard([], 0n, params);
    expect(board).toMatchObject({ entries: [], lowest: null, next: null, gap: null, slice: 0n, topPile: 0n, totalSaved: 0n });
  });

  it("keeps the lowest agent last in every sort", () => {
    const stage = [
      agent("a", 300, LAUNCH, { savers: 1, savedToday: units(1) }),
      agent("b", 200, LAUNCH, { savers: 9, savedToday: units(5) }),
      agent("low", 100, LAUNCH, { savers: 99, savedToday: units(99) }),
    ];
    const { entries } = buildBoard(stage, 0n, params);
    expect(boardOrder(entries, "pile")).toEqual(["a", "b", "low"]);
    expect(boardOrder(entries, "savers")).toEqual(["b", "a", "low"]);
    expect(boardOrder(entries, "today")).toEqual(["b", "a", "low"]);
    expect(boardOrder(entries, "pays")).toEqual(["b", "a", "low"]);
  });

  it("breaks sort ties by pile rank and computes every order", () => {
    const stage = [agent("a", 300, LAUNCH, { savers: 5 }), agent("b", 200, LAUNCH, { savers: 5 }), agent("c", 100)];
    const orders = boardOrders(buildBoard(stage, 0n, params).entries);
    expect(orders.savers).toEqual(["a", "b", "c"]);
    expect(Object.keys(orders)).toEqual(["pile", "savers", "today", "pays"]);
  });
});

describe("helpers", () => {
  it("sizes pile bars against the top pile with a floor", () => {
    expect(barPercent(units(50), units(100))).toBe(50);
    expect(barPercent(units(1), units(100))).toBe(3);
    expect(barPercent(units(1), units(100), 4)).toBe(4);
    expect(barPercent(units(1), 0n)).toBe(3);
  });

  it("counts launch day as day 1, so cut 1 is on day 2", () => {
    expect(dayOfCut(1)).toBe(2);
  });
});
