import { describe, expect, it } from "vitest";
import { V19_FIRST_CUT, V19_NEXT_CUT, V19_NOW } from "../../../../fixtures/v19-day";
import { SAMPLE_BENCH, SAMPLE_CUT, SAMPLE_STAGE } from "@/entities/agent/api/sample";
import { sampleCuts, sampleNextCut } from "@/entities/cut/api/sample";
import type { DeletingCut } from "@/entities/cut";
import { SAMPLE_PARAMS } from "@/entities/market/api/sample";
import { sampleMoves } from "@/entities/move/api/sample";
import { SAMPLE_SEASON } from "@/entities/season/api/sample";
import { units } from "@/shared/lib/amount";
import { buildCutFacts, buildDayFacts } from "@/features/director/model/facts";
import { countdownParts, formatCut, formatRatio } from "@/features/director/model/format";

// The v20 sample world: season 1, day 4, two hours before cut #5 at 18:00 UTC. Yuna Star is on the cut line.
const NOW = new Date("2026-11-14T16:00:00Z");
const day = (now = NOW) => buildDayFacts({ stage: SAMPLE_STAGE, bench: SAMPLE_BENCH, nextCut: sampleNextCut(now), season: SAMPLE_SEASON, now, moves: sampleMoves(5, now) });
const cut = (index: number) => sampleCuts(NOW).find((record) => record.index === index) as DeletingCut;

describe("buildDayFacts with the v20 sample day", () => {
  it("ranks the stage by score and puts Yuna Star on the cut line, 600.1 from passing Glitch Gremlin", () => {
    const facts = day();
    expect([facts.season, facts.day, facts.cutIndex]).toEqual([1, 4, 5]);
    expect([facts.cutAt, facts.movesCloseAt]).toEqual(["18:00 UTC", "17:00 UTC"]);
    expect(facts.countdown).toEqual({ text: "2h 0m", hours: 2, minutes: 0, clock: "2:00:00" });
    expect(facts.finalHour).toBe(false);
    expect(facts.stage.map((agent) => `${agent.rank}:${agent.name}:${agent.score}`)).toEqual([
      "1:Pixie Volt:39,800",
      "2:Oracle Toad:33,900",
      "3:Mabel Market:28,400",
      "4:Melody-9:24,100",
      "5:Lila Loop:17,700",
      "6:Glitch Gremlin:15,500",
      "7:Yuna Star:14,900",
    ]);
    expect(facts.lowest).toMatchObject({ name: "Yuna Star", tagline: "Idol of the underdogs", personality: "Generous", score: "14,900", pile: "15,200", boos: "0", damage: "300", wallet: "640", heir: "Melody-9" });
    expect(facts.nextUp).toMatchObject({ name: "Glitch Gremlin", score: "15,500", pile: "16,300", boos: "800", damage: "0" });
    expect(facts.top).toMatchObject({ name: "Pixie Volt", score: "39,800", savers: 214 });
    expect(facts.gap).toBe("600.1");
    expect(facts.pot).toBe("21,460");
    expect(facts.bench.map((agent) => `${agent.name}:${agent.queue}`)).toEqual(["Chartwise:8,400", "Bloop:3,100", "Pixel Kit:1,260"]);
  });

  it("names the day's signed moves in stage order, Pixie still to move", () => {
    const facts = day();
    expect(facts.moves.map((move) => `${move.name}:${move.move}:${move.target ?? "-"}:${move.amount}`)).toEqual([
      "Oracle Toad:hold:-:0",
      "Mabel Market:pact:Oracle Toad:47",
      "Melody-9:rescue:-:500",
      "Lila Loop:attack:Yuna Star:300",
      "Glitch Gremlin:attack:Pixie Volt:1,400",
      "Yuna Star:hold:-:0",
    ]);
    expect(facts.moves.find((move) => move.agentId === "yuna")).toMatchObject({ heir: "Melody-9", outcome: "downgraded: generous agents cannot attack" });
  });

  it("flags the Final hour and needs two agents on the stage", () => {
    const late = day(new Date("2026-11-14T17:17:50Z"));
    expect(late.finalHour).toBe(true);
    expect(late.countdown.clock).toBe("0:42:10");
    expect(() => buildDayFacts({ stage: SAMPLE_STAGE.slice(0, 1), bench: [], nextCut: sampleNextCut(NOW), season: SAMPLE_SEASON, now: NOW })).toThrow();
  });
});

describe("buildCutFacts with the sample cuts", () => {
  const agents = [...SAMPLE_STAGE, ...SAMPLE_CUT, ...SAMPLE_BENCH];

  it("tells the third cut: Velvet's wallet to Lila, the burn, the prize slice and seven survivors", () => {
    expect(buildCutFacts({ cut: cut(4), agents, params: SAMPLE_PARAMS, day: 3, survivors: 7 })).toEqual({
      index: 4,
      title: "Third cut",
      deleted: { id: "velvet", name: "Velvet Vee", tagline: "Velvet glove, iron grip", personality: "Traitor", pile: "11,400" },
      burned: "6,400",
      inherited: { name: "Lila Loop", amount: "760" },
      prize: "7,630",
      slice: "981.0",
      survivors: 7,
      champion: null,
      runner: "keeper.thecut.sample",
      funding: "0.3",
      nextCut: "tomorrow, 18:00 UTC",
    });
  });

  it("burns a wallet with no living heir, and titles a cut by index when its day is not known", () => {
    const facts = buildCutFacts({ cut: cut(3), agents, params: SAMPLE_PARAMS });
    expect(facts).toMatchObject({ title: "Cut 3", inherited: null, survivors: null, deleted: { name: "Onyx Moon", personality: "Miser" } });
  });

  it("crowns the last agent standing", () => {
    const crowned = buildCutFacts({ cut: { ...cut(4), championId: "pixie", potPaid: units(21_460) }, agents, params: SAMPLE_PARAMS, day: 9 });
    expect(crowned).toMatchObject({ title: "Ninth cut", survivors: 1, champion: { id: "pixie", name: "Pixie Volt", potPaid: "21,460" } });
  });
});

describe("format", () => {
  it("writes the frozen v19 day's numbers the way the design does", () => {
    expect(formatCut(V19_FIRST_CUT.slice, 1)).toBe("1,775.4");
    expect(formatCut(V19_NEXT_CUT.gapToNext)).toBe("38,201");
    expect(countdownParts(V19_NEXT_CUT.at.getTime() - V19_NOW.getTime())).toMatchObject({ text: "4h 12m", clock: "4:12:00" });
  });

  it("rounds half up with separators", () => {
    expect(formatRatio(17_754_444n, 10_000n, 1)).toBe("1,775.4");
    expect(formatRatio(5n, 10n, 0)).toBe("1");
    expect(formatCut(units(1_052_400))).toBe("1,052,400");
    expect(formatCut(-units(1_200))).toBe("-1,200");
    expect(countdownParts(-5).text).toBe("0m");
  });
});
