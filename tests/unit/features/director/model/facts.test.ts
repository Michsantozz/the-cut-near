import { describe, expect, it } from "vitest";
import { SAMPLE_FIRST_CUT, SAMPLE_NEXT_CUT, SAMPLE_NOW } from "@/entities/cut/api/sample";
import { SAMPLE_PARAMS } from "@/entities/market/api/sample";
import { SAMPLE_BENCH, SAMPLE_STAGE } from "@/entities/agent/api/sample";
import { units } from "@/shared/lib/amount";
import { buildCutFacts, buildDayFacts } from "@/features/director/model/facts";
import { countdownParts, formatCut, formatRatio } from "@/features/director/model/format";

// SPEC-v19 §2: day 2, Fri Nov 13 13:48 UTC; the slice uses the 5,020 fees expected by 18:00.
const day = () => buildDayFacts({ stage: SAMPLE_STAGE, bench: SAMPLE_BENCH, nextCut: SAMPLE_NEXT_CUT, params: SAMPLE_PARAMS, now: SAMPLE_NOW, fees: units(5_020) });

describe("buildDayFacts with the SPEC sample day", () => {
  it("finds Kiko Bun on the block, 38,201 short of Onyx Moon, 4h 12m before the 18:00 UTC cut", () => {
    const facts = day();
    expect(facts.day).toBe(2);
    expect(facts.cutAt).toBe("18:00 UTC");
    expect(facts.countdown).toEqual({ text: "4h 12m", hours: 4, minutes: 12, clock: "4:12:00" });
    expect(facts.finalHour).toBe(false);
    expect([facts.lowest.name, facts.lowest.pile]).toEqual(["Kiko Bun", "23,600"]);
    expect([facts.nextUp.name, facts.nextUp.pile]).toEqual(["Onyx Moon", "61,800"]);
    expect([facts.top.name, facts.top.pile, facts.top.savers]).toEqual(["Pixie Volt", "182,400", 412]);
    expect(facts.gap).toBe("38,201");
    expect(facts.bench[0]).toMatchObject({ name: "Chartwise", queue: "88,400", savers: 241 });
  });

  it("computes the equal slice and the 'pays per 100 saved' column of SPEC-v19", () => {
    const facts = day();
    expect(facts.slice).toBe("1,775.4");
    expect(Object.fromEntries(facts.stage.map((agent) => [agent.name, agent.paysPer100]))).toEqual({
      "Pixie Volt": "0.97",
      "Lila Loop": "1.17",
      "Oracle Toad": "1.27",
      "Mabel Market": "1.46",
      "Melody-9": "1.58",
      "Yuna Star": "1.80",
      "Glitch Gremlin": "2.04",
      "Velvet Vee": "2.39",
      "Onyx Moon": "2.87",
      "Kiko Bun": null,
    });
  });

  it("uses the fees so far by default and flags the Final hour", () => {
    const facts = buildDayFacts({ stage: SAMPLE_STAGE, bench: SAMPLE_BENCH, nextCut: SAMPLE_NEXT_CUT, params: SAMPLE_PARAMS, now: new Date("2026-11-13T17:17:50Z") });
    expect(facts.fees).toBe("4,100");
    expect(facts.finalHour).toBe(true);
    expect(facts.countdown.clock).toBe("0:42:10");
  });
});

describe("buildCutFacts with the SPEC sample cut", () => {
  it("names the cut, the burn, the prize, the slice and Chartwise taking the seat", () => {
    const facts = buildCutFacts({ cut: SAMPLE_FIRST_CUT, agents: [...SAMPLE_STAGE, ...SAMPLE_BENCH], params: SAMPLE_PARAMS });
    expect(facts).toEqual({
      index: 1,
      title: "First cut",
      deleted: { id: "kiko", name: "Kiko Bun", kind: "VTuber", pile: "23,600" },
      burned: "11,800",
      prize: "16,820",
      slice: "1,775.4",
      creatorSlice: "93.4",
      joined: { id: "chartwise", name: "Chartwise", pile: "88,400" },
      runner: "bob.near",
      agentsAfter: 10,
      nextCut: "tomorrow, 18:00 UTC",
    });
  });
});

describe("format", () => {
  it("rounds half up with separators", () => {
    expect(formatRatio(17_754_444n, 10_000n, 1)).toBe("1,775.4");
    expect(formatRatio(5n, 10n, 0)).toBe("1");
    expect(formatCut(units(1_052_400))).toBe("1,052,400");
    expect(countdownParts(-5).text).toBe("0m");
  });
});
